#include <napi.h>
#include <windows.h>
#include <thread>
#include <atomic>
#include <iostream>
#include <mutex>
#include <condition_variable>

// Global state
std::atomic<bool> isRunning(false);
std::atomic<bool> isEnabled(false);
HHOOK hHook = NULL;
std::thread hookThread;
DWORD hookThreadId = 0;

std::mutex mtx;
std::condition_variable cv;
bool hookInstalled = false;

// Shared memory for blocked keys (0-255 VK codes)
// 1 = blocked, 0 = allowed
std::atomic<uint8_t> blockedKeys[256] = {0};

// The low-level keyboard hook callback
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION) {
        KBDLLHOOKSTRUCT* pKeyBoard = (KBDLLHOOKSTRUCT*)lParam;
        DWORD vkCode = pKeyBoard->vkCode;
        
        // System/Bypass keys (HARDCODED SAFETY)
        if (vkCode == VK_ESCAPE ||    // Esc
            vkCode == VK_F8 ||        // Engine Toggle (ScenePlus default)
            vkCode == VK_F9 ||        // Settings Toggle
            vkCode == VK_LWIN ||      // Windows Key
            vkCode == VK_RWIN ||      // Windows Key
            vkCode == VK_CONTROL ||   // Ctrl (modifiers are safe to pass)
            vkCode == VK_LCONTROL ||
            vkCode == VK_RCONTROL ||
            vkCode == VK_SHIFT ||
            vkCode == VK_LSHIFT ||
            vkCode == VK_RSHIFT ||
            vkCode == VK_MENU ||      // Alt
            vkCode == VK_LMENU ||
            vkCode == VK_RMENU ||
            (vkCode >= VK_F1 && vkCode <= VK_F12)) // Function keys
        {
            return CallNextHookEx(hHook, nCode, wParam, lParam); // ALWAYS ALLOW
        }

        // If enabled and the key is marked as blocked
        if (isEnabled.load() && vkCode < 256 && blockedKeys[vkCode].load() == 1) {
            // Block the event from passing to other apps (do NOT call CallNextHookEx)
            // Windows requires returning a non-zero value to block the message
            return 1;
        }
    }
    
    // Default: pass the event to the next hook in the chain (e.g. uiohook)
    return CallNextHookEx(hHook, nCode, wParam, lParam);
}

void MessageLoop() {
    // Install the hook
    hHook = SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc, GetModuleHandle(NULL), 0);
    
    if (hHook == NULL) {
        std::cerr << "[KeyBlock] Failed to install hook!" << std::endl;
        {
            std::lock_guard<std::mutex> lock(mtx);
            hookInstalled = true;
        }
        cv.notify_one();
        return;
    }
    
    // Store thread ID so we can post a quit message to it
    hookThreadId = GetCurrentThreadId();
    
    // Notify the main thread that the hook is fully installed
    {
        std::lock_guard<std::mutex> lock(mtx);
        hookInstalled = true;
    }
    cv.notify_one();
    
    MSG msg;
    // Standard Windows message pump for the hook thread
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    
    // Cleanup
    if (hHook) {
        UnhookWindowsHookEx(hHook);
        hHook = NULL;
    }
}

// Node-API: start()
Napi::Value Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (isRunning.load()) {
        return Napi::Boolean::New(env, true);
    }
    
    hookInstalled = false;
    isRunning = true;
    hookThread = std::thread(MessageLoop);
    
    // Block JS thread until the native hook is actually registered
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return hookInstalled; });
    
    return Napi::Boolean::New(env, hHook != NULL);
}

// Node-API: stop()
Napi::Value Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!isRunning.load()) {
        return Napi::Boolean::New(env, true);
    }
    
    // Post WM_QUIT to break the message loop
    if (hookThreadId != 0) {
        PostThreadMessageW(hookThreadId, WM_QUIT, 0, 0);
    }
    
    if (hookThread.joinable()) {
        hookThread.join();
    }
    
    isRunning = false;
    hookThreadId = 0;
    
    return Napi::Boolean::New(env, true);
}

// Node-API: setEnabled(bool)
Napi::Value SetEnabled(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "Boolean expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    bool enabled = info[0].As<Napi::Boolean>().Value();
    isEnabled = enabled;
    
    return Napi::Boolean::New(env, enabled);
}

// Node-API: setBlockedKey(vkCode, blocked)
Napi::Value SetBlockedKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean()) {
        Napi::TypeError::New(env, "Number and Boolean expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    uint32_t vkCode = info[0].As<Napi::Number>().Uint32Value();
    bool blocked = info[1].As<Napi::Boolean>().Value();
    
    if (vkCode < 256) {
        blockedKeys[vkCode] = blocked ? 1 : 0;
        return Napi::Boolean::New(env, true);
    }
    
    return Napi::Boolean::New(env, false);
}

// Node-API: clearAllBlockedKeys()
Napi::Value ClearAllBlockedKeys(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    for (int i = 0; i < 256; i++) {
        blockedKeys[i] = 0;
    }
    
    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "start"), Napi::Function::New(env, Start));
    exports.Set(Napi::String::New(env, "stop"), Napi::Function::New(env, Stop));
    exports.Set(Napi::String::New(env, "setEnabled"), Napi::Function::New(env, SetEnabled));
    exports.Set(Napi::String::New(env, "setBlockedKey"), Napi::Function::New(env, SetBlockedKey));
    exports.Set(Napi::String::New(env, "clearAllBlockedKeys"), Napi::Function::New(env, ClearAllBlockedKeys));
    return exports;
}

NODE_API_MODULE(keyblock, Init)
