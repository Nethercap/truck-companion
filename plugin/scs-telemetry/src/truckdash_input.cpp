// Truck Dash: the buttons of the dashboard through the game's input SDK. See
// truckdash_input.hpp for the block where the client asks for them.
#include "truckdash_input.hpp"

#include <cstring>

#ifdef _WIN32
#include <windows.h>

#include <string>
#else
#include <ctime>
#endif

#include "scssdk_input.h"
#include "sharedmemory.hpp"

namespace {

// The inputs of a semantical device are mixes of controls.sii, by name. These
// are the 13 of the dashboard, in the order of BOTONES in
// client/entrada_sdk.py: the client asks for them by index, so a new one goes
// at the end.
//
// Only these, on purpose. The game takes a declared input as a bound one, even
// if it never gets a press: with a plugin that declares every mix (wipersback
// among them) the wipers stay at full speed and the wiper key no longer turns
// them off (forum.scssoft.com, t=328756). So no input here that no button
// needs, and nothing that saves the game.
const scs_input_device_input_t kInputs[] = {
    {"flasher4way", "Hazard lights", SCS_VALUE_TYPE_bool},
    {"beacon", "Beacon", SCS_VALUE_TYPE_bool},
    {"diflock", "Differential lock", SCS_VALUE_TYPE_bool},
    {"parkingbrake", "Parking brake", SCS_VALUE_TYPE_bool},
    {"engine", "Engine", SCS_VALUE_TYPE_bool},
    {"attach", "Trailer", SCS_VALUE_TYPE_bool},
    {"camcycle", "Next camera", SCS_VALUE_TYPE_bool},
    {"cruiectrl", "Cruise control", SCS_VALUE_TYPE_bool},
    {"light", "Lights", SCS_VALUE_TYPE_bool},
    {"hblight", "High beam", SCS_VALUE_TYPE_bool},
    {"infotainment", "Infotainment", SCS_VALUE_TYPE_bool},
    {"liftaxle", "Lift axle", SCS_VALUE_TYPE_bool},
    {"wipers", "Wipers", SCS_VALUE_TYPE_bool},
};
const uint32_t kButtons = sizeof(kInputs) / sizeof(kInputs[0]);

// How long a button stays down: a press of one frame can get lost, and at 80
// ms no mix takes it for a long press. Then it stays up for a couple of
// frames, so two presses in a row are two presses.
const uint64_t kHoldMs = 80;
const uint32_t kHoldFrames = 3;
const uint32_t kGapFrames = 2;

enum class Stage { idle, down, gap };

SharedMemory* g_mem = nullptr;
tdInputMap_t* g_map = nullptr;
uint32_t g_sessions = 0;
Stage g_stage = Stage::idle;
uint32_t g_button = 0;  // the one that is down
uint64_t g_downAt = 0;
uint32_t g_stageFrames = 0;  // frames that ended since the stage began
uint32_t g_seen = 0;         // the last request looked at

// The clock of the block, the same one the client reads.
uint64_t now_ms() {
#ifdef _WIN32
  return GetTickCount64();
#else
  timespec now;
#ifdef __APPLE__
  clock_gettime(CLOCK_UPTIME_RAW, &now);  // Python's time.monotonic() on macOS
#else
  clock_gettime(CLOCK_MONOTONIC, &now);
#endif
  return static_cast<uint64_t>(now.tv_sec) * 1000 + static_cast<uint64_t>(now.tv_nsec) / 1000000;
#endif
}

bool turned_off() {
#ifdef _WIN32
  HMODULE self = nullptr;
  if (!GetModuleHandleExW(
          GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
          reinterpret_cast<LPCWSTR>(&turned_off), &self)) {
    return false;
  }
  wchar_t path[1024];
  const DWORD length = GetModuleFileNameW(self, path, 1024);
  if (length == 0 || length >= 1024) return false;
  std::wstring file(path, length);
  const size_t slash = file.find_last_of(L"\\/");
  if (slash == std::wstring::npos) return false;
  file.replace(slash + 1, std::wstring::npos, TD_INPUT_OFF_FILE);
  return GetFileAttributesW(file.c_str()) != INVALID_FILE_ATTRIBUTES;
#else
  return false;
#endif
}

void reset_presses() {
  g_stage = Stage::idle;
  g_stageFrames = 0;
  g_seen = 0;
}

void finish(uint32_t request, uint32_t result) {
  g_map->result.store(result, std::memory_order_relaxed);
  g_map->done.store(request, std::memory_order_release);
}

// The next request of the client, if there is one to press.
bool take_request(uint64_t now) {
  const uint32_t id = g_map->requestEnd.load(std::memory_order_acquire);
  if (id == 0 || id == g_seen || g_map->request.load(std::memory_order_acquire) != id) return false;
  const uint32_t button = g_map->button.load(std::memory_order_relaxed);
  const uint64_t asked = g_map->requestTick.load(std::memory_order_relaxed);
  g_seen = id;
  if (button >= kButtons) {
    finish(id, TD_INPUT_UNKNOWN);
    return false;
  }
  if ((now > asked ? now - asked : asked - now) > TD_INPUT_ACCEPT_MS) {
    finish(id, TD_INPUT_EXPIRED);
    return false;
  }
  g_button = button;
  return true;
}

SCSAPI_VOID input_active(const scs_u8_t active, const scs_context_t) {
  if (g_map != nullptr) g_map->active.store(active ? 1 : 0, std::memory_order_relaxed);
}

void set_button(scs_input_event_t* const event, bool down) {
  event->input_index = g_button;
  event->value_bool.value = down ? 1 : 0;
  g_stage = down ? Stage::down : Stage::gap;
  g_stageFrames = 0;
}

// Whether there is an event for the game now. `activated`: the device comes
// back after a stop. If that was in the middle of a press (the game lost the
// focus) the button is still down for the game, so it goes up at once; and
// nothing new goes down, in case the calls of that frame all say `activated`.
bool next_event(scs_input_event_t* const event, bool activated, uint64_t now) {
  if (g_stage == Stage::down) {
    if (!activated && (now - g_downAt < kHoldMs || g_stageFrames < kHoldFrames)) return false;
    set_button(event, false);
    return true;
  }
  if (g_stage == Stage::gap) {
    if (g_stageFrames < kGapFrames) return false;
    g_stage = Stage::idle;
  }
  if (activated || !take_request(now)) return false;
  set_button(event, true);
  g_downAt = now;
  g_map->presses.fetch_add(1, std::memory_order_relaxed);
  finish(g_seen, TD_INPUT_PRESSED);
  return true;
}

// The game calls this over and over in every frame until it returns not_found,
// so that is what ends a frame here. Not first_in_frame: it can still be set
// in the repeated calls.
SCSAPI_RESULT input_event(scs_input_event_t* const event, const scs_u32_t flags, const scs_context_t) {
  if (g_map == nullptr || event == nullptr) return SCS_RESULT_not_found;
  const uint64_t now = now_ms();
  g_map->tick.store(now, std::memory_order_relaxed);
  g_map->active.store(1, std::memory_order_relaxed);
  if (next_event(event, (flags & SCS_INPUT_EVENT_CALLBACK_FLAG_first_after_activation) != 0, now)) {
    return SCS_RESULT_ok;
  }
  g_stageFrames++;
  g_map->frames.fetch_add(1, std::memory_order_relaxed);
  return SCS_RESULT_not_found;
}

}  // namespace

void truckdash_input_close() {
  if (g_map != nullptr) {
    // The reader may keep the block alive after this, and outside Windows it
    // is a file that stays.
    g_map->active.store(0, std::memory_order_relaxed);
    g_map->revision.store(0, std::memory_order_release);
    g_map = nullptr;
  }
  if (g_mem != nullptr) {
    g_mem->Close();
    delete g_mem;
    g_mem = nullptr;
  }
  reset_presses();
}

// Whatever goes wrong here, the answer is ok: the telemetry of this same
// plugin has to go on, and without the block the client uses keystrokes.
SCSAPI_RESULT scs_input_init(const scs_u32_t version, const scs_input_init_params_t* const params) {
  if (version != SCS_INPUT_VERSION_1_00) return SCS_RESULT_unsupported;
  const auto* input = static_cast<const scs_input_init_params_v100_t*>(params);
  const scs_log_t log = input->common.log;
  truckdash_input_close();

  if (turned_off()) {
    log(SCS_LOG_TYPE_message, "[Truck Dash] buttons through the SDK turned off by truckdash-no-input.txt");
    return SCS_RESULT_ok;
  }
  g_mem = new SharedMemory(TD_INPUT_MMF_NAME, sizeof(tdInputMap_t));
  if (!g_mem->Hooked()) {
    log(SCS_LOG_TYPE_warning, "[Truck Dash] no shared memory for the buttons");
    delete g_mem;
    g_mem = nullptr;
    return SCS_RESULT_ok;
  }

  scs_input_device_t device;
  memset(&device, 0, sizeof(device));
  device.name = "truckdash";
  device.display_name = "Truck Dash";
  device.type = SCS_INPUT_DEVICE_TYPE_semantical;
  device.input_count = kButtons;
  device.inputs = kInputs;
  device.input_active_callback = input_active;
  device.input_event_callback = input_event;
  if (input->register_device(&device) != SCS_RESULT_ok) {
    log(SCS_LOG_TYPE_warning, "[Truck Dash] the game did not register the buttons");
    truckdash_input_close();
    return SCS_RESULT_ok;
  }

  g_map = static_cast<tdInputMap_t*>(g_mem->GetBuffer());
  reset_presses();
  g_sessions++;
  g_map->session.store(static_cast<uint32_t>(now_ms()) ^ (g_sessions << 24), std::memory_order_relaxed);
  g_map->buttons.store(kButtons, std::memory_order_relaxed);
  g_map->revision.store(TD_INPUT_REVISION, std::memory_order_release);
  return SCS_RESULT_ok;
}

SCSAPI_VOID scs_input_shutdown(void) {
  truckdash_input_close();
}
