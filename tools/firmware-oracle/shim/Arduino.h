// Minimal host-side stand-in for the Arduino core, enough to compile the
// tracker firmware's src/kiss_utils.cpp unmodified. Edge-case semantics follow
// the Arduino String implementation (cores/esp32/WString.cpp), because the
// firmware codec relies on them: charAt() past the end returns 0, substring()
// clamps its bounds, toInt() is atol().
#pragma once

#include <cstdint>
#include <cstdlib>
#include <string>

class String {
public:
    String() {}
    String(const char* s) : s_(s ? s : "") {}
    String(const std::string& s) : s_(s) {}

    unsigned int length() const { return s_.size(); }
    bool isEmpty() const { return s_.empty(); }
    const char* c_str() const { return s_.c_str(); }
    const std::string& str() const { return s_; }

    char charAt(unsigned int i) const { return i < s_.size() ? s_[i] : 0; }
    void setCharAt(unsigned int i, char c) { if (i < s_.size()) s_[i] = c; }

    int indexOf(char c) const { auto p = s_.find(c); return p == std::string::npos ? -1 : (int)p; }
    int indexOf(const String& t) const { auto p = s_.find(t.s_); return p == std::string::npos ? -1 : (int)p; }

    String substring(unsigned int left) const { return substring(left, s_.size()); }
    String substring(unsigned int left, unsigned int right) const {
        if (left > right) { unsigned int t = left; left = right; right = t; }
        if (left >= s_.size()) return String();
        if (right > s_.size()) right = s_.size();
        return String(s_.substr(left, right - left));
    }

    void remove(unsigned int index, unsigned int count) {
        if (index >= s_.size()) return;
        s_.erase(index, count);
    }

    long toInt() const { return std::atol(s_.c_str()); }

    String& operator+=(const String& o) { s_ += o.s_; return *this; }
    String& operator+=(const char* o) { s_ += o; return *this; }
    String& operator+=(char c) { s_ += c; return *this; }
    String& operator+=(int n) { s_ += std::to_string(n); return *this; }

    friend String operator+(const String& a, const String& b) { return String(a.s_ + b.s_); }
    friend String operator+(const String& a, const char* b) { return String(a.s_ + b); }
    friend String operator+(char a, const String& b) { return String(std::string(1, a) + b.s_); }

private:
    std::string s_;
};
