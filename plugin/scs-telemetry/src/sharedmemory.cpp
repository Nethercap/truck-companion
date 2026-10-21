#include "sharedmemory.hpp"
#include <cstring>

#ifndef _WIN32
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

void SharedMemory::LogError(const char* logPtr) {
#ifdef SHAREDMEM_LOGGING
	if (this->logFilePtr == NULL)
	{
		this->logFilePtr = fopen(SHAREDMEM_FILENAME, "a");
	}
	if (this->logFilePtr != NULL)
	{
		fprintf(this->logFilePtr, "%s\r\n", logPtr);
#ifdef _WIN32
		fprintf(this->logFilePtr, "Windows Error code: %d\r\n\r\n", GetLastError());
#endif
	}
#endif
}

#ifdef _WIN32
SharedMemory::SharedMemory(LPCWSTR newNamePtr, unsigned int size) {
    this->mapsize = size;
    this->namePtr = newNamePtr;
    this->isSharedMemoryHooked = false;
#ifdef SHAREDMEM_LOGGING
	this->logFilePtr = NULL;
#endif

    hMapFile = CreateFileMapping(
        INVALID_HANDLE_VALUE, // use paging file
        nullptr, // default security
        PAGE_READWRITE, // read/write access
        0, // maximum object size (high-order DWORD)
        size, // maximum object size (low-order DWORD)
        this->namePtr); // name of mapping object
    LogError("Created file map");
    if (hMapFile == nullptr) {
        LogError("but it's NULL!");
        if (GetLastError() == static_cast<DWORD>(183)) // already exists
        {
            hMapFile = OpenFileMapping(FILE_MAP_ALL_ACCESS, false, this->namePtr);
            if (hMapFile == nullptr) {
                LogError("Could not open existing file mapping");
                return;
            }
        }
        else {
            LogError("Could not create file mapping object");
            return;
        }
    }
    else {
        LogError("and it's not NULL!");
    }

    this->pBufferPtr = static_cast<void*>(MapViewOfFile(hMapFile, FILE_MAP_ALL_ACCESS, 0, 0, size));
    if (this->pBufferPtr == nullptr) {
        LogError("Could not reserve buffer for shared memory");
        CloseHandle(hMapFile);
    }
    else {
        memset(this->pBufferPtr, 0, size);
        this->isSharedMemoryHooked = true;
        LogError("Opened MMF");
    }

}


void SharedMemory::Close() {
#ifdef SHAREDMEM_LOGGING
		if (logFilePtr != NULL)
		{
			fclose(logFilePtr);
			// TODO: Is this closed properly?
		}
#endif
    if (isSharedMemoryHooked) {
        if (pBufferPtr != nullptr) UnmapViewOfFile(pBufferPtr);
        if (hMapFile != nullptr) CloseHandle(hMapFile);
    }

    isSharedMemoryHooked = false;

}
#else
SharedMemory::SharedMemory(const char* newNamePtr, unsigned int size) {
    this->mapsize = size;
    this->namePtr = newNamePtr;
    this->isSharedMemoryHooked = false;
    this->fd = -1;
    this->pBufferPtr = nullptr;
#ifdef SHAREDMEM_LOGGING
    this->logFilePtr = NULL;
#endif

    int f = open(this->namePtr, O_RDWR | O_CREAT, 0666);
    if (f < 0) {
        LogError("Could not open/create shared memory file");
        return;
    }
    if (ftruncate(f, size) < 0) {
        LogError("Could not truncate shared memory file");
        close(f);
        return;
    }
    void* ptr = mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_SHARED, f, 0);
    if (ptr == MAP_FAILED || ptr == nullptr) {
        LogError("Could not mmap shared memory file");
        close(f);
        return;
    }
    this->fd = f;
    this->pBufferPtr = ptr;
    memset(this->pBufferPtr, 0, size);
    this->isSharedMemoryHooked = true;
    LogError("Opened shared memory");
}

void SharedMemory::Close() {
#ifdef SHAREDMEM_LOGGING
    if (logFilePtr != NULL) {
        fclose(logFilePtr);
    }
#endif
    if (isSharedMemoryHooked) {
        if (pBufferPtr != nullptr && pBufferPtr != MAP_FAILED) {
            munmap(pBufferPtr, mapsize);
            pBufferPtr = nullptr;
        }
        if (fd >= 0) {
            close(fd);
            fd = -1;
        }
    }
    isSharedMemoryHooked = false;
}
#endif
