-- Migration 0006: Add resolved_at column to tickets for precise retention tracking
ALTER TABLE tickets ADD COLUMN resolved_at TEXT;
