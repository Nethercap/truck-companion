#ifndef SHAREDMEMORY_HPP
#define SHAREDMEMORY_HPP
#ifdef _WIN32
#include <windows.h>
#else
#include <cstddef>
#endif
#include <stdio.h>
#include <stdlib.h>
#include "scs-telemetry-common.hpp"

#undef SHAREDMEM_LOGGING
#if ETS2_PLUGIN_LOGGING_ON == 1
	#if ETS2_PLUGIN_LOGGING_SHAREDMEMORY == 1
		#define SHAREDMEM_FILENAME ETS2_PLUGIN_FILENAME_PREFIX "sharedmem.txt"
		#define SHAREDMEM_LOGGING 1
	#endif
#endif

class SharedMemory
{
protected:

#ifdef _WIN32
        LPCWSTR namePtr;
        HANDLE hMapFile;
#else
        const char* namePtr;
        int fd;
#endif
        int mapsize;

		// MMF specifics
        void* pBufferPtr;

		// Status about hook
        bool isSharedMemoryHooked;

		// Logging
#ifdef SHAREDMEM_LOGGING
		FILE *logFilePtr;
#endif

        void LogError(const char* logPtr);

public:
        bool Hooked() { return isSharedMemoryHooked; }
        void* GetBuffer() { return pBufferPtr; }

#ifdef _WIN32
        SharedMemory(LPCWSTR newNamePtr, unsigned int size);
#else
        SharedMemory(const char* newNamePtr, unsigned int size);
#endif
        void Close();

		void* getPtrAt(int offset) { return (void*) &(((unsigned char*)pBufferPtr)[offset]); }


};

#endif
