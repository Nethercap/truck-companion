// Truck Dash: the TruckersMP part of the plugin. The TruckersMP client loads
// the DLLs in bin\win_x64\plugins\ as its own plugins too, and calls
// truckersmp_init in the ones that export it; the game keeps calling
// scs_telemetry_init as before. Without TruckersMP none of this runs.
// See truckersmp_players.hpp for the block it writes. The SDK is x64 only.
#ifdef _WIN64

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <TruckersMP/TruckersMP.hxx>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <optional>
#include <string>
#include <unordered_set>
#include <vector>

#include "sharedmemory.hpp"
#include "truckersmp_players.hpp"

namespace {

// The client sends the list once a second: four writes a second keep it
// fresh without walking the players on every frame.
const ULONGLONG kWriteEveryMs = 250;

// A plain pointer, freed only by truckersmp_shutdown: the Session destructor
// calls the host to remove its listeners, and as a global it would also run
// when the DLL is detached at process exit, maybe after the TruckersMP client
// is gone. The SDK calls truckersmp_shutdown before unloading a plugin whose
// init returned true, so a session still here at exit is left as it is.
TruckersMP::Session* g_session = nullptr;
SharedMemory* g_mem = nullptr;
tmpPlayersMap_t* g_map = nullptr;
// Entity IDs of the players streamed in, from the stream in/out events
// (and GetAllPlayers once at init, for a load in the middle of a server
// session). The SDK says not to keep handles, and GetAllPlayers is a
// snapshot, not something to poll.
std::unordered_set<TruckersMP::Int32> g_streamed;
ULONGLONG g_lastWrite = 0;

// Forward is -Z in the vehicle's space. Rotated, its X and Z give the yaw
// the way the SCS SDK stores the truck's heading: <0,1), counterclockwise
// from north (-Z), so 0.25 is west.
float HeadingFromRotation(const TruckersMP::Quaternion& q) {
  const double forwardX = -2.0 * (q.x * q.z + q.w * q.y);
  const double forwardZ = -(1.0 - 2.0 * (q.x * q.x + q.y * q.y));
  double turns = std::atan2(-forwardX, -forwardZ) / (2.0 * 3.14159265358979323846);
  if (turns < 0) turns += 1.0;
  return static_cast<float>(turns);
}

// Truncated to the field without cutting a UTF-8 character in half.
void CopyName(char* dst, const std::string& name) {
  size_t n = std::min(name.size(), static_cast<size_t>(TMP_PLAYERS_NAME_SIZE - 1));
  while (n > 0 && n < name.size() && (static_cast<unsigned char>(name[n]) & 0xC0) == 0x80) n--;
  memcpy(dst, name.data(), n);
  dst[n] = '\0';
}

void Publish(const std::vector<tmpPlayer_t>& players, bool connected, uint64_t serverId, int32_t localId) {
  if (g_map == nullptr) return;
  volatile uint32_t* sequence = &g_map->sequence;
  *sequence = *sequence + 1;  // odd: writing
  MemoryBarrier();
  const uint32_t count = static_cast<uint32_t>(std::min(players.size(), static_cast<size_t>(TMP_PLAYERS_MAX)));
  g_map->revision = TMP_PLAYERS_REVISION;
  g_map->tick = GetTickCount64();
  g_map->serverId = serverId;
  g_map->localId = localId;
  g_map->connected = connected ? 1 : 0;
  g_map->count = count;
  if (count > 0) memcpy(g_map->players, players.data(), count * sizeof(tmpPlayer_t));
  MemoryBarrier();
  *sequence = *sequence + 1;  // even: done
}

void Refresh() {
  using namespace TruckersMP;
  const bool connected = g_session->Network().IsConnected().value_or(false);
  const std::optional<Player> local = g_session->Player().GetLocalPlayer();
  const Int32 localId = local ? local->GetPlayerID().value_or(-1) : -1;

  std::vector<tmpPlayer_t> found;
  found.reserve(g_streamed.size());
  for (auto it = g_streamed.begin(); it != g_streamed.end();) {
    const Int32 id = *it;
    const std::optional<Player> player = g_session->Player().GetPlayerByID(id);
    if (!player) {
      // Gone without a stream out we could read.
      it = g_streamed.erase(it);
      continue;
    }
    ++it;
    if (id == localId) continue;
    const std::optional<Vehicle> vehicle = player->GetVehicle();
    if (!vehicle) continue;
    const std::optional<Placement> placement = vehicle->GetPlacement();
    if (!placement) continue;

    tmpPlayer_t p{};
    p.x = placement->position.x;
    p.y = placement->position.y;
    p.z = placement->position.z;
    p.accountId = player->GetAccountID().value_or(0);
    p.id = id;
    p.heading = HeadingFromRotation(placement->rotation);
    const Float3 v = vehicle->GetLinearVelocity().value_or(Float3{});
    p.speed = std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    p.distance = player->GetDistanceFromLocalPlayer().value_or(-1.0f);
    CopyName(p.name, player->GetUsername().value_or(std::string()));
    found.push_back(p);
  }
  // The closest first (unknown distance last): over TMP_PLAYERS_MAX, the
  // far ones are left out.
  std::sort(found.begin(), found.end(), [](const tmpPlayer_t& a, const tmpPlayer_t& b) {
    if ((a.distance < 0) != (b.distance < 0)) return b.distance < 0;
    return a.distance < b.distance;
  });
  Publish(found, connected, g_session->Network().GetGameServerID().value_or(0), localId);
}

void DropSession() {
  delete g_session;  // unregisters every listener
  g_session = nullptr;
}

void Release() {
  DropSession();
  g_streamed.clear();
  if (g_mem != nullptr) {
    // Empty right away: the reader may keep the block alive after this.
    Publish({}, false, 0, -1);
    g_mem->Close();
    delete g_mem;
    g_mem = nullptr;
    g_map = nullptr;
  }
}

}  // namespace

TMP_EXPORT bool TMP_API truckersmp_init(const TruckersMP_Host* host, TruckersMP_PluginDesc* desc) {
  using namespace TruckersMP;
  PluginInfo info;
  info.m_name = "Truck Dash";
  info.m_author = "Truck Dash";
  info.m_version = "1.12.1-truckdash.5";  // PLUGIN_DLL_VERSION in client/plugin_installer.py
  info.m_description =
      "Shows the TruckersMP players around you on the map of the Truck Dash app. "
      "It only hands them to the Truck Dash client on this PC.";
  FillPluginDesc(desc, info);

  g_session = Session::Create(host).release();
  if (g_session == nullptr) return false;
  if (!g_session->Player().IsAvailable() || !g_session->Vehicle().IsAvailable() ||
      !g_session->Network().IsAvailable() || !g_session->Render().IsAvailable()) {
    DropSession();
    return false;
  }
  g_mem = new SharedMemory(TMP_PLAYERS_MMF_NAME, sizeof(tmpPlayersMap_t));
  if (!g_mem->Hooked()) {
    g_session->Core().LogMessage(LogLevel::Error, "Truck Dash: could not open the shared memory for the players");
    delete g_mem;
    g_mem = nullptr;
    DropSession();
    return false;
  }
  g_map = static_cast<tmpPlayersMap_t*>(g_mem->GetBuffer());

  if (const std::optional<std::vector<Player>> all = g_session->Player().GetAllPlayers()) {
    for (const Player& player : *all) {
      if (const std::optional<Int32> id = player.GetPlayerID()) g_streamed.insert(*id);
    }
  }
  g_session->Player().OnStreamIn.Register([](PlayerStreamInEvent& e) {
    if (const std::optional<Int32> id = e.GetPlayer().GetPlayerID()) g_streamed.insert(*id);
  });
  g_session->Player().OnStreamOut.Register([](PlayerStreamOutEvent& e) {
    if (const std::optional<Int32> id = e.GetPlayer().GetPlayerID()) g_streamed.erase(*id);
  });
  g_session->Network().OnDisconnected.Register([] {
    g_streamed.clear();
    Refresh();
  });
  g_session->Render().OnPreRender.Register([] {
    const ULONGLONG now = GetTickCount64();
    if (now - g_lastWrite < kWriteEveryMs) return;
    g_lastWrite = now;
    Refresh();
  });
  Refresh();
  return true;
}

TMP_EXPORT void TMP_API truckersmp_shutdown(void) {
  Release();
}

#endif
