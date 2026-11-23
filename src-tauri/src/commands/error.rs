use serde::Serialize;

use crate::domain::DomainError;

/// Error payload sent to the frontend: `{ kind, message }`.
/// `kind` is a stable identifier the UI switches on; `message` is for display/logs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandError {
    pub kind: &'static str,
    pub message: String,
}

impl From<DomainError> for CommandError {
    fn from(err: DomainError) -> Self {
        let kind = match &err {
            DomainError::ProjectNotFound => "ProjectNotFound",
            DomainError::AlreadyRegistered => "AlreadyRegistered",
            DomainError::OverlapsProject => "OverlapsProject",
            DomainError::InvalidPath(_) => "InvalidPath",
            DomainError::OutsideRoot => "OutsideRoot",
            DomainError::NotFound => "NotFound",
            DomainError::PermissionDenied => "PermissionDenied",
            DomainError::NotADirectory => "NotADirectory",
            DomainError::NotMarkdown => "NotMarkdown",
            DomainError::NotUtf8 => "NotUtf8",
            DomainError::Io(_) => "Io",
            DomainError::Storage(_) => "Storage",
        };
        Self {
            kind,
            message: err.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_kind_and_message() {
        let e = CommandError::from(DomainError::OutsideRoot);
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["kind"], "OutsideRoot");
        assert_eq!(json["message"], "path is outside the project folder");
    }

    #[test]
    fn maps_every_variant_to_a_stable_kind() {
        let cases = [
            (DomainError::ProjectNotFound, "ProjectNotFound"),
            (DomainError::AlreadyRegistered, "AlreadyRegistered"),
            (DomainError::OverlapsProject, "OverlapsProject"),
            (DomainError::InvalidPath("x".into()), "InvalidPath"),
            (DomainError::OutsideRoot, "OutsideRoot"),
            (DomainError::NotFound, "NotFound"),
            (DomainError::PermissionDenied, "PermissionDenied"),
            (DomainError::NotADirectory, "NotADirectory"),
            (DomainError::NotMarkdown, "NotMarkdown"),
            (DomainError::NotUtf8, "NotUtf8"),
            (DomainError::Io("boom".into()), "Io"),
            (DomainError::Storage("locked".into()), "Storage"),
        ];
        for (err, kind) in cases {
            assert_eq!(CommandError::from(err).kind, kind);
        }
    }
}
