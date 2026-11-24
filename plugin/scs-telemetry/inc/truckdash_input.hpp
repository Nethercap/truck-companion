#ifndef TRUCKDASH_INPUT_HPP
#define TRUCKDASH_INPUT_HPP

// Truck Dash: the buttons of the dashboard, pressed through the game's own
// input SDK (a semantical device, scssdk_input.h) instead of keystrokes. The
// client asks for a press in this block and src/truckdash_input.cpp hands it
// to the game.
//
// It is a block of its own, not a zone of the telemetry one: the SDK does not
// say whether scs_input_init or scs_telemetry_init comes first, and telemetry
// clears its block when it opens it. The telemetry block keeps its layout.
//
// client/entrada_sdk.py reads and writes it with the same offsets: change both
// at once and bump the revision. client/test_entrada_sdk.py compares them.

#include <atomic>
#include <cstddef>
#include <cstdint>

#ifdef _WIN32
#define TD_INPUT_MMF_NAME L"Local\\TruckDashInput"
#elif defined(__APPLE__)
#define TD_INPUT_MMF_NAME "/tmp/TruckDashInput"
#else
#define TD_INPUT_MMF_NAME "/dev/shm/TruckDashInput"
#endif

#define TD_INPUT_REVISION 1

// What happened with the last request.
#define TD_INPUT_PRESSED 1  // the game took the press
#define TD_INPUT_EXPIRED 2  // it came too late (TD_INPUT_ACCEPT_MS): not pressed
#define TD_INPUT_UNKNOWN 3  // no such button in this plugin: not pressed

// A request older than this is never pressed: by then the client has already
// fallen back to the keyboard, and pressing it too would undo the toggle.
// The client waits longer than this before giving up.
#define TD_INPUT_ACCEPT_MS 300

// Where a file with this name sits next to the DLL, the device is not
// registered and the game behaves as without it (the client uses keystrokes).
#define TD_INPUT_OFF_FILE L"truckdash-no-input.txt"

struct tdInputMap_t {
  // ----- Written by the plugin -----
  std::atomic<uint32_t> revision;  // TD_INPUT_REVISION; 0: not registered
  std::atomic<uint32_t> buttons;   // how many buttons the device declares
  std::atomic<uint32_t> active;    // 1 while the game takes input from the device
  std::atomic<uint32_t> frames;    // +1 per frame in which the game asked for input
  std::atomic<uint64_t> tick;      // clock of the last of those frames, in ms
  std::atomic<uint32_t> session;   // another value with every scs_input_init
  std::atomic<uint32_t> presses;   // presses the game took, for diagnostics
  std::atomic<uint32_t> result;    // of the request in `done`, TD_INPUT_*
  std::atomic<uint32_t> done;      // the last request resolved, written last
  // ----- Written by the client -----
  std::atomic<uint32_t> button;       // index in the plugin's list
  std::atomic<uint32_t> request;      // the request's id, never 0
  std::atomic<uint64_t> requestTick;  // clock of the request, in ms
  // The same id, written last: until it matches `request` the request is half
  // written. 0 takes the request back.
  std::atomic<uint32_t> requestEnd;
  uint32_t padding;
};

static_assert(std::atomic<uint32_t>::is_always_lock_free, "u32 in shared memory");
static_assert(std::atomic<uint64_t>::is_always_lock_free, "u64 in shared memory");
static_assert(sizeof(tdInputMap_t) == 64, "tdInputMap_t layout");
static_assert(offsetof(tdInputMap_t, tick) == 16, "tdInputMap_t layout");
static_assert(offsetof(tdInputMap_t, done) == 36, "tdInputMap_t layout");
static_assert(offsetof(tdInputMap_t, button) == 40, "tdInputMap_t layout");
static_assert(offsetof(tdInputMap_t, requestEnd) == 56, "tdInputMap_t layout");

// Closes the block. The game calls scs_input_shutdown, and DllMain (or the
// destructor) calls this again when the library goes away.
void truckdash_input_close();

#endif
