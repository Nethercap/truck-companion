// Truck Dash: the in-game overlay drawn inside the game's frame, from the
// TruckersMP client's post-render event, so it shows in clips and in
// recordings that only capture the game. The client draws the image and
// writes it in the block of truckersmp_overlay.hpp; this pastes it on top of
// the frame with the D3D11 device TruckersMP hands out. Nothing here hooks
// the game: without TruckersMP it never runs and the client keeps its window.
//
// Every frame it writes pluginTick, the frame size and a status in the block,
// whether it can draw or not: the client only stops using its window while
// that says READY. On any failure it reports it and draws nothing.
#ifdef _WIN64

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <d3d11.h>

#include <TruckersMP/TruckersMP.hxx>

#include <cstring>
#include <optional>

#include "truckersmp_overlay.hpp"

namespace {

// D3DCompile from d3dcompiler_47.dll, which Windows 10 and 11 carry in
// System32. It is loaded only from there (never from the game folder) and
// only once, to compile the two small shaders below; precompiled bytecode
// would need the Windows SDK's fxc wherever the plugin is built.
using CompileFn = HRESULT(WINAPI*)(LPCVOID, SIZE_T, LPCSTR, const D3D_SHADER_MACRO*, ID3DInclude*, LPCSTR,
                                   LPCSTR, UINT, UINT, ID3DBlob**, ID3DBlob**);
const UINT kOptimizationLevel3 = 1u << 15;  // D3DCOMPILE_OPTIMIZATION_LEVEL3

// One quad from SV_VertexID (no vertex buffer or input layout), its corners
// in clip space from the constant buffer, the image sampled texel for texel.
// On an sRGB or float render target the hardware expects linear light: the
// image is sRGB (what the overlay window shows), so it is decoded first.
const char kShaders[] = R"(
cbuffer Overlay : register(b0) {
  float4 rect;     // left, top, right, bottom in clip space
  float4 options;  // x: 1 to write linear light
};
struct Varyings {
  float4 pos : SV_Position;
  float2 uv : TEXCOORD0;
};
Varyings vs_main(uint id : SV_VertexID) {
  float2 t = float2(id & 1, id >> 1);
  Varyings o;
  o.pos = float4(lerp(rect.x, rect.z, t.x), lerp(rect.y, rect.w, t.y), 0.0, 1.0);
  o.uv = t;
  return o;
}
Texture2D image : register(t0);
SamplerState nearest : register(s0);
float4 ps_main(Varyings i) : SV_Target {
  float4 c = image.Sample(nearest, i.uv);
  if (options.x > 0.5) {
    float3 low = c.rgb / 12.92;
    float3 high = pow((c.rgb + 0.055) / 1.055, 2.4);
    c.rgb = lerp(high, low, step(c.rgb, 0.04045));
  }
  return c;
}
)";

struct Constants {
  float rect[4];
  float options[4];
};

template <typename T>
void SafeRelease(T*& p) {
  if (p != nullptr) {
    p->Release();
    p = nullptr;
  }
}

TruckersMP::Session* g_owner = nullptr;  // owned by truckersmp_players.cpp
HANDLE g_mapping = nullptr;
tdOverlayMap_t* g_block = nullptr;

ID3D11Device* g_device = nullptr;
ID3D11DeviceContext* g_context = nullptr;
ID3D11VertexShader* g_vs = nullptr;
ID3D11PixelShader* g_ps = nullptr;
ID3D11Buffer* g_constants = nullptr;
ID3D11BlendState* g_blend = nullptr;
ID3D11RasterizerState* g_raster = nullptr;
ID3D11DepthStencilState* g_depth = nullptr;
ID3D11SamplerState* g_sampler = nullptr;
ID3D11Texture2D* g_texture = nullptr;
ID3D11ShaderResourceView* g_view = nullptr;
UINT g_texWidth = 0;
UINT g_texHeight = 0;
uint32_t g_uploaded = 0xFFFFFFFFu;  // sequence of the image in the texture
bool g_textureValid = false;
// Set when something could not be created: it is not tried again every frame
// (compiling shaders 60 times a second), until TruckersMP loads the plugin again.
uint32_t g_failed = TD_OVERLAY_STATUS_NONE;
bool g_loggedReady = false;

void ReleaseDevice() {
  SafeRelease(g_view);
  SafeRelease(g_texture);
  SafeRelease(g_sampler);
  SafeRelease(g_depth);
  SafeRelease(g_raster);
  SafeRelease(g_blend);
  SafeRelease(g_constants);
  SafeRelease(g_ps);
  SafeRelease(g_vs);
  SafeRelease(g_context);
  SafeRelease(g_device);
  g_texWidth = g_texHeight = 0;
  g_uploaded = 0xFFFFFFFFu;
  g_textureValid = false;
}

void Log(TruckersMP::LogLevel level, const char* text) {
  if (g_owner != nullptr) g_owner->Core().LogMessage(level, text);
}

bool CompileShaders() {
  HMODULE compiler = LoadLibraryExW(L"d3dcompiler_47.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
  if (compiler == nullptr) return false;
  const auto compile =
      reinterpret_cast<CompileFn>(reinterpret_cast<void*>(GetProcAddress(compiler, "D3DCompile")));
  ID3DBlob* vs = nullptr;
  ID3DBlob* ps = nullptr;
  bool ok = compile != nullptr &&
            SUCCEEDED(compile(kShaders, sizeof(kShaders) - 1, "truckdash_overlay", nullptr, nullptr, "vs_main",
                              "vs_4_0", kOptimizationLevel3, 0, &vs, nullptr)) &&
            SUCCEEDED(compile(kShaders, sizeof(kShaders) - 1, "truckdash_overlay", nullptr, nullptr, "ps_main",
                              "ps_4_0", kOptimizationLevel3, 0, &ps, nullptr));
  ok = ok && SUCCEEDED(g_device->CreateVertexShader(vs->GetBufferPointer(), vs->GetBufferSize(), nullptr, &g_vs)) &&
       SUCCEEDED(g_device->CreatePixelShader(ps->GetBufferPointer(), ps->GetBufferSize(), nullptr, &g_ps));
  SafeRelease(vs);
  SafeRelease(ps);
  FreeLibrary(compiler);
  return ok;
}

bool CreateStates() {
  D3D11_BUFFER_DESC cb = {};
  cb.ByteWidth = sizeof(Constants);
  cb.Usage = D3D11_USAGE_DYNAMIC;
  cb.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
  cb.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
  if (FAILED(g_device->CreateBuffer(&cb, nullptr, &g_constants))) return false;

  // Straight alpha over the frame, keeping the frame's own alpha.
  D3D11_BLEND_DESC blend = {};
  blend.RenderTarget[0].BlendEnable = TRUE;
  blend.RenderTarget[0].SrcBlend = D3D11_BLEND_SRC_ALPHA;
  blend.RenderTarget[0].DestBlend = D3D11_BLEND_INV_SRC_ALPHA;
  blend.RenderTarget[0].BlendOp = D3D11_BLEND_OP_ADD;
  blend.RenderTarget[0].SrcBlendAlpha = D3D11_BLEND_ZERO;
  blend.RenderTarget[0].DestBlendAlpha = D3D11_BLEND_ONE;
  blend.RenderTarget[0].BlendOpAlpha = D3D11_BLEND_OP_ADD;
  blend.RenderTarget[0].RenderTargetWriteMask = D3D11_COLOR_WRITE_ENABLE_ALL;
  if (FAILED(g_device->CreateBlendState(&blend, &g_blend))) return false;

  D3D11_RASTERIZER_DESC raster = {};
  raster.FillMode = D3D11_FILL_SOLID;
  raster.CullMode = D3D11_CULL_NONE;
  raster.DepthClipEnable = TRUE;
  if (FAILED(g_device->CreateRasterizerState(&raster, &g_raster))) return false;

  D3D11_DEPTH_STENCIL_DESC depth = {};
  depth.DepthEnable = FALSE;
  depth.DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ZERO;
  depth.DepthFunc = D3D11_COMPARISON_ALWAYS;
  depth.StencilEnable = FALSE;
  if (FAILED(g_device->CreateDepthStencilState(&depth, &g_depth))) return false;

  D3D11_SAMPLER_DESC sampler = {};
  sampler.Filter = D3D11_FILTER_MIN_MAG_MIP_POINT;
  sampler.AddressU = sampler.AddressV = sampler.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
  sampler.ComparisonFunc = D3D11_COMPARISON_NEVER;
  sampler.MaxLOD = D3D11_FLOAT32_MAX;
  return SUCCEEDED(g_device->CreateSamplerState(&sampler, &g_sampler));
}

// The device and what is drawn with it, the first time. Returns the status.
uint32_t EnsureDevice() {
  if (g_device != nullptr) return TD_OVERLAY_STATUS_READY;
  if (g_failed != TD_OVERLAY_STATUS_NONE) return g_failed;
  const std::optional<TruckersMP::RendererID> renderer = g_owner->Render().GetRendererID();
  if (!renderer) return TD_OVERLAY_STATUS_NO_DEVICE;
  if (*renderer != TruckersMP::RendererID::DirectX11) return TD_OVERLAY_STATUS_NOT_DX11;
  const std::optional<TruckersMP::Uint64> handle = g_owner->Render().GetDeviceHandle();
  if (!handle || *handle == 0) return TD_OVERLAY_STATUS_NO_DEVICE;
  g_device = reinterpret_cast<ID3D11Device*>(static_cast<uintptr_t>(*handle));
  g_device->AddRef();
  g_device->GetImmediateContext(&g_context);
  if (g_context == nullptr || !CompileShaders() || !CreateStates()) {
    ReleaseDevice();
    g_failed = TD_OVERLAY_STATUS_NO_SHADERS;
    Log(TruckersMP::LogLevel::Error,
        "Truck Dash: could not set up the in-game overlay (d3dcompiler_47.dll or D3D11); it stays in its window");
    return g_failed;
  }
  return TD_OVERLAY_STATUS_READY;
}

// The image of the block in the texture, if it changed. Returns whether the
// texture holds a whole image to draw.
bool Upload() {
  volatile uint32_t* sequence = &g_block->sequence;
  const uint32_t before = *sequence;
  if (before & 1u) return g_textureValid;  // the client is writing: the last one this frame
  if (before == g_uploaded && g_textureValid) return true;
  MemoryBarrier();
  const uint32_t width = g_block->width;
  const uint32_t height = g_block->height;
  if (width == 0 || height == 0 || width > TD_OVERLAY_MAX_WIDTH || height > TD_OVERLAY_MAX_HEIGHT) {
    g_textureValid = false;
    return false;
  }
  if (g_texture == nullptr || width != g_texWidth || height != g_texHeight) {
    SafeRelease(g_view);
    SafeRelease(g_texture);
    g_texWidth = g_texHeight = 0;
    D3D11_TEXTURE2D_DESC desc = {};
    desc.Width = width;
    desc.Height = height;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DYNAMIC;
    desc.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
    if (FAILED(g_device->CreateTexture2D(&desc, nullptr, &g_texture)) ||
        FAILED(g_device->CreateShaderResourceView(g_texture, nullptr, &g_view))) {
      SafeRelease(g_view);
      SafeRelease(g_texture);
      g_textureValid = false;
      return false;
    }
    g_texWidth = width;
    g_texHeight = height;
  }
  D3D11_MAPPED_SUBRESOURCE mapped = {};
  if (FAILED(g_context->Map(g_texture, 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped))) {
    g_textureValid = false;
    return false;
  }
  const uint8_t* src = g_block->pixels;
  uint8_t* dst = static_cast<uint8_t*>(mapped.pData);
  for (uint32_t row = 0; row < height; ++row) {
    memcpy(dst + static_cast<size_t>(row) * mapped.RowPitch, src + static_cast<size_t>(row) * width * 4, width * 4);
  }
  g_context->Unmap(g_texture, 0);
  MemoryBarrier();
  if (*sequence != before) {
    // Written while copying: half of one image and half of another. The next
    // frame copies it again.
    g_textureValid = false;
    return false;
  }
  g_uploaded = before;
  g_textureValid = true;
  return true;
}

bool LinearTarget(DXGI_FORMAT format) {
  switch (format) {
    case DXGI_FORMAT_R8G8B8A8_UNORM_SRGB:
    case DXGI_FORMAT_B8G8R8A8_UNORM_SRGB:
    case DXGI_FORMAT_B8G8R8X8_UNORM_SRGB:
    case DXGI_FORMAT_R16G16B16A16_FLOAT:
    case DXGI_FORMAT_R32G32B32A32_FLOAT:
    case DXGI_FORMAT_R11G11B10_FLOAT:
      return true;
    default:
      return false;
  }
}

// Everything Draw changes, to leave the pipeline as the game (and TruckersMP)
// had it. Like the backup of Dear ImGui's D3D11 backend, plus the hull and
// domain shaders: one left bound would make the draw fail.
struct PipelineBackup {
  UINT scissorCount, viewportCount;
  D3D11_RECT scissors[D3D11_VIEWPORT_AND_SCISSORRECT_OBJECT_COUNT_PER_PIPELINE];
  D3D11_VIEWPORT viewports[D3D11_VIEWPORT_AND_SCISSORRECT_OBJECT_COUNT_PER_PIPELINE];
  ID3D11RasterizerState* raster;
  ID3D11BlendState* blend;
  FLOAT blendFactor[4];
  UINT sampleMask;
  ID3D11DepthStencilState* depth;
  UINT stencilRef;
  ID3D11RenderTargetView* targets[D3D11_SIMULTANEOUS_RENDER_TARGET_COUNT];
  ID3D11DepthStencilView* depthView;
  ID3D11ShaderResourceView* psView;
  ID3D11SamplerState* psSampler;
  ID3D11Buffer* vsConstants;
  ID3D11Buffer* psConstants;
  ID3D11PixelShader* ps;
  ID3D11VertexShader* vs;
  ID3D11GeometryShader* gs;
  ID3D11HullShader* hs;
  ID3D11DomainShader* ds;
  UINT psInstances, vsInstances, gsInstances, hsInstances, dsInstances;
  ID3D11ClassInstance* psInstance[256];
  ID3D11ClassInstance* vsInstance[256];
  ID3D11ClassInstance* gsInstance[256];
  ID3D11ClassInstance* hsInstance[256];
  ID3D11ClassInstance* dsInstance[256];
  D3D11_PRIMITIVE_TOPOLOGY topology;
  ID3D11Buffer* indexBuffer;
  DXGI_FORMAT indexFormat;
  UINT indexOffset;
  ID3D11Buffer* vertexBuffer;
  UINT vertexStride, vertexOffset;
  ID3D11InputLayout* layout;
};
PipelineBackup g_backup;  // big (class instance arrays): not on the game's stack

void Save(ID3D11DeviceContext* c, PipelineBackup& b) {
  b.scissorCount = b.viewportCount = D3D11_VIEWPORT_AND_SCISSORRECT_OBJECT_COUNT_PER_PIPELINE;
  c->RSGetScissorRects(&b.scissorCount, b.scissors);
  c->RSGetViewports(&b.viewportCount, b.viewports);
  c->RSGetState(&b.raster);
  c->OMGetBlendState(&b.blend, b.blendFactor, &b.sampleMask);
  c->OMGetDepthStencilState(&b.depth, &b.stencilRef);
  c->OMGetRenderTargets(D3D11_SIMULTANEOUS_RENDER_TARGET_COUNT, b.targets, &b.depthView);
  c->PSGetShaderResources(0, 1, &b.psView);
  c->PSGetSamplers(0, 1, &b.psSampler);
  c->VSGetConstantBuffers(0, 1, &b.vsConstants);
  c->PSGetConstantBuffers(0, 1, &b.psConstants);
  b.psInstances = b.vsInstances = b.gsInstances = b.hsInstances = b.dsInstances = 256;
  c->PSGetShader(&b.ps, b.psInstance, &b.psInstances);
  c->VSGetShader(&b.vs, b.vsInstance, &b.vsInstances);
  c->GSGetShader(&b.gs, b.gsInstance, &b.gsInstances);
  c->HSGetShader(&b.hs, b.hsInstance, &b.hsInstances);
  c->DSGetShader(&b.ds, b.dsInstance, &b.dsInstances);
  c->IAGetPrimitiveTopology(&b.topology);
  c->IAGetIndexBuffer(&b.indexBuffer, &b.indexFormat, &b.indexOffset);
  c->IAGetVertexBuffers(0, 1, &b.vertexBuffer, &b.vertexStride, &b.vertexOffset);
  c->IAGetInputLayout(&b.layout);
}

void ReleaseInstances(ID3D11ClassInstance** instances, UINT count) {
  for (UINT i = 0; i < count; ++i) SafeRelease(instances[i]);
}

void Restore(ID3D11DeviceContext* c, PipelineBackup& b) {
  c->RSSetScissorRects(b.scissorCount, b.scissors);
  c->RSSetViewports(b.viewportCount, b.viewports);
  c->RSSetState(b.raster);
  SafeRelease(b.raster);
  c->OMSetBlendState(b.blend, b.blendFactor, b.sampleMask);
  SafeRelease(b.blend);
  c->OMSetDepthStencilState(b.depth, b.stencilRef);
  SafeRelease(b.depth);
  c->OMSetRenderTargets(D3D11_SIMULTANEOUS_RENDER_TARGET_COUNT, b.targets, b.depthView);
  for (ID3D11RenderTargetView*& t : b.targets) SafeRelease(t);
  SafeRelease(b.depthView);
  c->PSSetShaderResources(0, 1, &b.psView);
  SafeRelease(b.psView);
  c->PSSetSamplers(0, 1, &b.psSampler);
  SafeRelease(b.psSampler);
  c->VSSetConstantBuffers(0, 1, &b.vsConstants);
  SafeRelease(b.vsConstants);
  c->PSSetConstantBuffers(0, 1, &b.psConstants);
  SafeRelease(b.psConstants);
  c->PSSetShader(b.ps, b.psInstance, b.psInstances);
  SafeRelease(b.ps);
  ReleaseInstances(b.psInstance, b.psInstances);
  c->VSSetShader(b.vs, b.vsInstance, b.vsInstances);
  SafeRelease(b.vs);
  ReleaseInstances(b.vsInstance, b.vsInstances);
  c->GSSetShader(b.gs, b.gsInstance, b.gsInstances);
  SafeRelease(b.gs);
  ReleaseInstances(b.gsInstance, b.gsInstances);
  c->HSSetShader(b.hs, b.hsInstance, b.hsInstances);
  SafeRelease(b.hs);
  ReleaseInstances(b.hsInstance, b.hsInstances);
  c->DSSetShader(b.ds, b.dsInstance, b.dsInstances);
  SafeRelease(b.ds);
  ReleaseInstances(b.dsInstance, b.dsInstances);
  c->IASetPrimitiveTopology(b.topology);
  c->IASetIndexBuffer(b.indexBuffer, b.indexFormat, b.indexOffset);
  SafeRelease(b.indexBuffer);
  c->IASetVertexBuffers(0, 1, &b.vertexBuffer, &b.vertexStride, &b.vertexOffset);
  SafeRelease(b.vertexBuffer);
  c->IASetInputLayout(b.layout);
  SafeRelease(b.layout);
}

void Draw(ID3D11RenderTargetView* target, UINT frameWidth, UINT frameHeight, bool linear) {
  ID3D11DeviceContext* c = g_context;
  Save(c, g_backup);

  D3D11_MAPPED_SUBRESOURCE mapped = {};
  if (SUCCEEDED(c->Map(g_constants, 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped))) {
    const float x = static_cast<float>(g_block->x);
    const float y = static_cast<float>(g_block->y);
    const float w = static_cast<float>(frameWidth);
    const float h = static_cast<float>(frameHeight);
    Constants k = {};
    k.rect[0] = 2.0f * x / w - 1.0f;
    k.rect[1] = 1.0f - 2.0f * y / h;
    k.rect[2] = 2.0f * (x + static_cast<float>(g_texWidth)) / w - 1.0f;
    k.rect[3] = 1.0f - 2.0f * (y + static_cast<float>(g_texHeight)) / h;
    k.options[0] = linear ? 1.0f : 0.0f;
    memcpy(mapped.pData, &k, sizeof(k));
    c->Unmap(g_constants, 0);

    D3D11_VIEWPORT viewport = {};
    viewport.Width = w;
    viewport.Height = h;
    viewport.MaxDepth = 1.0f;
    c->RSSetViewports(1, &viewport);
    c->RSSetState(g_raster);
    const FLOAT factor[4] = {0, 0, 0, 0};
    c->OMSetBlendState(g_blend, factor, 0xFFFFFFFFu);
    c->OMSetDepthStencilState(g_depth, 0);
    c->OMSetRenderTargets(1, &target, nullptr);
    c->IASetInputLayout(nullptr);
    c->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLESTRIP);
    ID3D11Buffer* noBuffer = nullptr;
    const UINT zero = 0;
    c->IASetVertexBuffers(0, 1, &noBuffer, &zero, &zero);
    c->IASetIndexBuffer(nullptr, DXGI_FORMAT_UNKNOWN, 0);
    c->VSSetShader(g_vs, nullptr, 0);
    c->VSSetConstantBuffers(0, 1, &g_constants);
    c->PSSetShader(g_ps, nullptr, 0);
    c->PSSetConstantBuffers(0, 1, &g_constants);
    c->PSSetShaderResources(0, 1, &g_view);
    c->PSSetSamplers(0, 1, &g_sampler);
    c->GSSetShader(nullptr, nullptr, 0);
    c->HSSetShader(nullptr, nullptr, 0);
    c->DSSetShader(nullptr, nullptr, 0);
    c->Draw(4, 0);
  }
  Restore(c, g_backup);
}

// What the frame is drawn on at post-render: the first render target, a 2D
// texture (the back buffer). Its size goes to the client.
bool FrameTarget(ID3D11RenderTargetView** target, UINT* width, UINT* height, bool* linear) {
  ID3D11RenderTargetView* view = nullptr;
  g_context->OMGetRenderTargets(1, &view, nullptr);
  if (view == nullptr) return false;
  D3D11_RENDER_TARGET_VIEW_DESC viewDesc = {};
  view->GetDesc(&viewDesc);
  ID3D11Resource* resource = nullptr;
  view->GetResource(&resource);
  ID3D11Texture2D* texture = nullptr;
  if (resource != nullptr) resource->QueryInterface(__uuidof(ID3D11Texture2D), reinterpret_cast<void**>(&texture));
  SafeRelease(resource);
  const bool flat = viewDesc.ViewDimension == D3D11_RTV_DIMENSION_TEXTURE2D ||
                    viewDesc.ViewDimension == D3D11_RTV_DIMENSION_TEXTURE2DMS;
  if (texture == nullptr || !flat) {
    SafeRelease(texture);
    SafeRelease(view);
    return false;
  }
  D3D11_TEXTURE2D_DESC desc = {};
  texture->GetDesc(&desc);
  SafeRelease(texture);
  *target = view;  // the caller releases it
  *width = desc.Width;
  *height = desc.Height;
  *linear = LinearTarget(viewDesc.Format);
  return true;
}

void Report(uint32_t status, UINT width, UINT height) {
  g_block->frameWidth = width;
  g_block->frameHeight = height;
  g_block->status = status;
  g_block->pluginRevision = TD_OVERLAY_REVISION;
  MemoryBarrier();
  g_block->pluginTick = GetTickCount64();
}

void OnPostRender() {
  if (g_block == nullptr) return;
  const uint32_t status = EnsureDevice();
  if (status != TD_OVERLAY_STATUS_READY) {
    Report(status, 0, 0);
    return;
  }
  ID3D11RenderTargetView* target = nullptr;
  UINT width = 0, height = 0;
  bool linear = false;
  if (!FrameTarget(&target, &width, &height, &linear)) {
    Report(TD_OVERLAY_STATUS_NO_TARGET, 0, 0);
    return;
  }
  Report(TD_OVERLAY_STATUS_READY, width, height);
  if (!g_loggedReady) {
    g_loggedReady = true;
    Log(TruckersMP::LogLevel::Info, "Truck Dash: in-game overlay ready");
  }
  const uint64_t now = GetTickCount64();
  const uint64_t clientTick = g_block->clientTick;
  const bool wanted = g_block->revision == TD_OVERLAY_REVISION && g_block->visible == 1 && clientTick != 0 &&
                      now >= clientTick && now - clientTick <= TD_OVERLAY_CLIENT_STALE_MS;
  if (wanted && Upload()) Draw(target, width, height, linear);
  SafeRelease(target);
}

}  // namespace

bool TruckDashOverlayStart(TruckersMP::Session* session) {
  if (g_block != nullptr) return true;
  // Create it, or open the one the client made: the same name and size. The
  // client's part is left as it is (it may already hold an image).
  const unsigned long long size = sizeof(tdOverlayMap_t);
  g_mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, static_cast<DWORD>(size >> 32),
                                 static_cast<DWORD>(size & 0xFFFFFFFFull), TD_OVERLAY_MMF_NAME);
  if (g_mapping == nullptr) return false;
  g_block = static_cast<tdOverlayMap_t*>(MapViewOfFile(g_mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(tdOverlayMap_t)));
  if (g_block == nullptr) {
    CloseHandle(g_mapping);
    g_mapping = nullptr;
    return false;
  }
  g_owner = session;
  g_failed = TD_OVERLAY_STATUS_NONE;
  g_loggedReady = false;
  session->Render().OnPostRender.Register([] { OnPostRender(); });
  return true;
}

void TruckDashOverlayStop() {
  // The session (and with it the post-render listener) is gone by now.
  ReleaseDevice();
  if (g_block != nullptr) {
    // Right away, not when the tick gets old: nobody draws it now.
    g_block->status = TD_OVERLAY_STATUS_NONE;
    g_block->pluginTick = 0;
    UnmapViewOfFile(g_block);
    g_block = nullptr;
  }
  if (g_mapping != nullptr) {
    CloseHandle(g_mapping);
    g_mapping = nullptr;
  }
  g_owner = nullptr;
}

#endif
