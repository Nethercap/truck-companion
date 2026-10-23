#ifndef TRUCKERSMP_PLAYERS_HPP
#define TRUCKERSMP_PLAYERS_HPP

// Truck Dash: the TruckersMP players around the local truck, for the map of
// the app. The TruckersMP client loads this same DLL as a plugin of its own
// (truckersmp_init, TruckersMP Client SDK in ../../truckersmp_sdk) and the
// part in truckersmp_players.cpp publishes the players it streams in, in a
// block of its own: the telemetry block keeps its layout (revision 12) and
// single player never creates this one.
//
// client/tmp_players.py reads it with the same offsets: change both at once
// and bump the revision.

#include <cstdint>

// TruckersMP only runs on Windows: there is no block elsewhere.
#define TMP_PLAYERS_MMF_NAME L"Local\\TruckDashTMP"
#define TMP_PLAYERS_REVISION 1
#define TMP_PLAYERS_MAX 64
#define TMP_PLAYERS_NAME_SIZE 64

struct tmpPlayer_t {
  // World position of the player's vehicle, in meters (same space as the
  // truck's coordinateX/Y/Z in the telemetry block).
  double x;
  double y;
  double z;
  uint64_t accountId;  // TruckersMP account, stable across sessions
  int32_t id;          // in-game ID, only for this server session
  // Like the SDK's truck heading: <0,1) counterclockwise from north.
  float heading;
  float speed;     // m/s
  float distance;  // m from the local player's vehicle
  char name[TMP_PLAYERS_NAME_SIZE];  // UTF-8, NUL-terminated
};
static_assert(sizeof(tmpPlayer_t) == 112, "tmpPlayer_t layout");

struct tmpPlayersMap_t {
  uint32_t revision;
  // Odd while the plugin writes: a reader that sees it odd, or different
  // before and after copying, read a half-written block.
  uint32_t sequence;
  // GetTickCount64() of the last write. The block outlives the TruckersMP
  // client while a reader keeps it open: an old tick means it is gone.
  uint64_t tick;
  uint64_t serverId;
  int32_t localId;
  uint8_t connected;
  uint8_t padding[3];
  uint32_t count;  // the closest first, at most TMP_PLAYERS_MAX
  uint32_t padding2;
  tmpPlayer_t players[TMP_PLAYERS_MAX];
};
static_assert(sizeof(tmpPlayersMap_t) == 40 + 112 * TMP_PLAYERS_MAX, "tmpPlayersMap_t layout");

#endif
