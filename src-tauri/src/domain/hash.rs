//! Content hashing for change detection.

const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

/// 64-bit FNV-1a. Stored in the database, so it must be stable across Rust
/// versions and platforms (unlike `std`'s `DefaultHasher`). Collisions only
/// matter for "same content?" checks on one file, where they are negligible.
pub fn fnv1a64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(FNV_OFFSET, |h, &b| {
        (h ^ u64::from(b)).wrapping_mul(FNV_PRIME)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_published_test_vectors() {
        // http://www.isthe.com/chongo/tech/comp/fnv/ (FNV-1a 64-bit)
        assert_eq!(fnv1a64(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a64(b"a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(fnv1a64(b"foobar"), 0x8594_4171_f739_67e8);
    }

    #[test]
    fn differs_for_different_content() {
        assert_ne!(fnv1a64(b"# Report\n"), fnv1a64(b"# Report!\n"));
    }
}
