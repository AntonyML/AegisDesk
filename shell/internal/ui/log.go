package ui

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
)

type Logger struct {
	mu   sync.Mutex
	file *os.File
}

func NewLogger(root string) (*Logger, error) {
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("create log directory: %w", err)
	}
	file, err := os.OpenFile(filepath.Join(root, "shell.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open shell log: %w", err)
	}
	return &Logger{file: file}, nil
}

func (l *Logger) Printf(format string, args ...any) {
	if l == nil || l.file == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	log.New(l.file, "", log.LstdFlags|log.LUTC).Printf(format, args...)
}

func (l *Logger) Close() error {
	if l == nil || l.file == nil {
		return nil
	}
	return l.file.Close()
}
