#ifndef TRUCKERSMP_OVERLAY_HPP
#define TRUCKERSMP_OVERLAY_HPP

// Truck Dash: the in-game overlay drawn inside the game's own frame, so it
// shows in clips and in recordings that only capture the game (Steam's game
// recording, Xbox Game Bar, OBS Game Capture). The client's overlay is a
// window of its own over the game, and those leave it out.
//
// The Truck Dash client draws the overlay as an image (client/overlay_imagen.py,
// the same drawing as its window) and writes it in this block
// (client/overlay_juego.py). truckersmp_overlay.cpp pastes it on every frame
// from the TruckersMP client's post-render event, which its SDK gives plugins
// for overlays, on the D3D11 device it hands out. Single player has no such
// event and the plugin hooks nothing: there the client keeps its window, and
// it also falls back to it whenever pluginTick stops moving.
//
// Both sides create or open the block by name. The client writes the first
// part and the image, the plugin only its own part, so neither waits for the
// other. client/overlay_juego.py uses the same offsets: change both at once
// and bump the revision (client/test_overlay_juego.py compares them).

#include <cstddef>
#include <cstdint>

// TruckersMP only runs on Windows: there is no block elsewhere.
#define TD_OVERLAY_MMF_NAME L"Local\\TruckDashOverlay"
#define TD_OVERLAY_REVISION 1
// The biggest image: the overlay at 200 % on a 4K screen is about 3600 x 1000.
// A bigger one is not drawn (the client keeps its window).
#define TD_OVERLAY_MAX_WIDTH 4096
#define TD_OVERLAY_MAX_HEIGHT 2048
// clientTick older than this and the image is not drawn: the client closed or
// hung, and its window would be gone too.
#define TD_OVERLAY_CLIENT_STALE_MS 2000

// What the plugin saw on its last post-render (status).
#define TD_OVERLAY_STATUS_NONE 0        // never ran: no TruckersMP, or the game has not drawn yet
#define TD_OVERLAY_STATUS_READY 1       // it draws the image (or would, with one)
#define TD_OVERLAY_STATUS_NOT_DX11 2    // the game runs on OpenGL
#define TD_OVERLAY_STATUS_NO_DEVICE 3   // TruckersMP gave no D3D11 device
#define TD_OVERLAY_STATUS_NO_SHADERS 4  // no d3dcompiler_47.dll, or a shader or state failed
#define TD_OVERLAY_STATUS_NO_TARGET 5   // nothing bound to draw on at post-render

struct tdOverlayMap_t {
  // --- written by the client
  uint32_t revision;  // TD_OVERLAY_REVISION
  // Seqlock of the image (width, height and pixels): odd while the client
  // writes them. A reader that sees it odd, or different before and after
  // copying, read a half-written image.
  uint32_t sequence;
  uint32_t visible;  // 1: draw it
  // Top left corner, in pixels of the frame (frameWidth x frameHeight).
  int32_t x;
  int32_t y;
  uint32_t width;   // at most TD_OVERLAY_MAX_WIDTH
  uint32_t height;  // at most TD_OVERLAY_MAX_HEIGHT
  uint32_t padding;
  uint64_t clientTick;  // GetTickCount64() of the client's last write
  // --- written by the plugin
  // GetTickCount64() of the last post-render, whatever its status. The block
  // outlives TruckersMP while the client keeps it open: an old tick means
  // nobody is drawing it, and the status is from back then.
  uint64_t pluginTick;
  // The size of what it draws on (the render target bound at post-render):
  // the client places and scales the overlay for it.
  uint32_t frameWidth;
  uint32_t frameHeight;
  uint32_t status;          // TD_OVERLAY_STATUS_*
  uint32_t pluginRevision;  // TD_OVERLAY_REVISION of the plugin
  // --- the image, written by the client: RGBA, straight (not premultiplied)
  // alpha, top row first, width * 4 bytes per row.
  uint8_t pixels[TD_OVERLAY_MAX_WIDTH * TD_OVERLAY_MAX_HEIGHT * 4];
};
static_assert(offsetof(tdOverlayMap_t, clientTick) == 32, "tdOverlayMap_t layout");
static_assert(offsetof(tdOverlayMap_t, pluginTick) == 40, "tdOverlayMap_t layout");
static_assert(offsetof(tdOverlayMap_t, pixels) == 64, "tdOverlayMap_t layout");
static_assert(sizeof(tdOverlayMap_t) == 64 + TD_OVERLAY_MAX_WIDTH * TD_OVERLAY_MAX_HEIGHT * 4, "tdOverlayMap_t layout");

#ifdef _WIN64
namespace TruckersMP {
class Session;
}
// From truckersmp_init, once the session is up: opens the block and draws on
// the session's post-render event. False if the block could not be opened
// (the players still work; the client keeps its window).
bool TruckDashOverlayStart(TruckersMP::Session* session);
// From truckersmp_shutdown, after the session (and its listener) is gone.
void TruckDashOverlayStop();
#endif

#endif
