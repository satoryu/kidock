//! URL helpers: percent-decoding for the `kidock-asset` scheme, and the rule
//! for which links may be opened in the OS browser.

/// Decodes `%XX` escapes. Returns `None` for malformed escapes or a result
/// that is not valid UTF-8. `+` is left alone (it is not a space in paths).
pub fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = bytes.get(i + 1..i + 3)?;
            let hex = std::str::from_utf8(hex).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Whether `url` may be handed to the OS browser: `http`/`https` only, with
/// no whitespace or control characters.
pub fn is_external_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    (lower.starts_with("http://") || lower.starts_with("https://"))
        && url.len() > "https://".len()
        && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_http_and_https_urls_are_external() {
        assert!(is_external_url("https://example.com/a?b=c#d"));
        assert!(is_external_url("HTTP://example.com"));
        for bad in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "mailto:x@y",
            "https://",
            "https://exa mple.com",
            "https://a\nb",
            "/relative",
        ] {
            assert!(!is_external_url(bad), "{bad}");
        }
    }

    #[test]
    fn decodes_escapes_including_slashes_and_utf8() {
        assert_eq!(
            percent_decode("7%2Fdocs%2Fa%20b.png").as_deref(),
            Some("7/docs/a b.png")
        );
        assert_eq!(
            percent_decode("%E8%AD%B0%E4%BA%8B%E9%8C%B2.png").as_deref(),
            Some("議事録.png")
        );
        assert_eq!(percent_decode("plain+name").as_deref(), Some("plain+name"));
    }

    #[test]
    fn rejects_malformed_escapes_and_invalid_utf8() {
        assert_eq!(percent_decode("bad%2"), None);
        assert_eq!(percent_decode("bad%zz"), None);
        assert_eq!(percent_decode("%FF%FE"), None);
    }
}
