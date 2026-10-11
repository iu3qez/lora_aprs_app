// Runs the tracker firmware's own KISS codec on the host.
//
//   oracle encode   stdin: one hex TNC2 line per input line
//                   stdout: hex of KISS_Utils::encodeKISS()      (tracker -> phone)
//   oracle decode   stdin: one hex KISS frame per input line
//                   stdout: "<dataFrame 0|1> <hex of KISS_Utils::decodeKISS()>"
//                                                                (phone -> tracker)
//
// Hex on both sides so that any byte, including FEND/FESC and NUL, survives the pipe.
#include <cstdio>
#include <iostream>
#include <string>

#include "kiss_utils.h"

static std::string fromHex(const std::string& h) {
    std::string out;
    for (size_t i = 0; i + 1 < h.size(); i += 2) out += (char)std::stoi(h.substr(i, 2), nullptr, 16);
    return out;
}

static std::string toHex(const std::string& s) {
    static const char* d = "0123456789abcdef";
    std::string out;
    for (unsigned char c : s) { out += d[c >> 4]; out += d[c & 15]; }
    return out;
}

int main(int argc, char** argv) {
    if (argc != 2) { std::fprintf(stderr, "usage: oracle encode|decode\n"); return 2; }
    std::string mode = argv[1];
    std::string line;
    while (std::getline(std::cin, line)) {
        String in(fromHex(line));
        if (mode == "encode") {
            std::cout << toHex(KISS_Utils::encodeKISS(in).str()) << "\n";
        } else if (mode == "decode") {
            bool dataFrame = false;
            String out = KISS_Utils::decodeKISS(in, dataFrame);
            std::cout << (dataFrame ? 1 : 0) << " " << toHex(out.str()) << "\n";
        } else {
            return 2;
        }
    }
    return 0;
}
