//go:build windows

package launch

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/go-ole/go-ole"
	"github.com/go-ole/go-ole/oleutil"
)

func CreateDesktopShortcut(shellPath, workingDirectory, displayName string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("find user home: %w", err)
	}
	desktop := filepath.Join(home, "Desktop")
	if err := os.MkdirAll(desktop, 0o755); err != nil {
		return fmt.Errorf("create desktop path: %w", err)
	}
	shortcutPath := filepath.Join(desktop, displayName+".lnk")
	if err := ole.CoInitialize(0); err != nil {
		return fmt.Errorf("initialize shortcut COM: %w", err)
	}
	defer ole.CoUninitialize()

	unknown, err := oleutil.CreateObject("WScript.Shell")
	if err != nil {
		return fmt.Errorf("create Windows shortcut object: %w", err)
	}
	defer unknown.Release()
	dispatch, err := unknown.QueryInterface(ole.IID_IDispatch)
	if err != nil {
		return fmt.Errorf("open Windows shortcut object: %w", err)
	}
	defer dispatch.Release()
	shortcutVariant, err := oleutil.CallMethod(dispatch, "CreateShortcut", shortcutPath)
	if err != nil {
		return fmt.Errorf("create shortcut: %w", err)
	}
	defer shortcutVariant.Clear()
	shortcut := shortcutVariant.ToIDispatch()
	if shortcut == nil {
		return fmt.Errorf("shortcut object is empty")
	}
	defer shortcut.Release()
	if _, err := oleutil.PutProperty(shortcut, "TargetPath", shellPath); err != nil {
		return fmt.Errorf("set shortcut target: %w", err)
	}
	if _, err := oleutil.PutProperty(shortcut, "WorkingDirectory", workingDirectory); err != nil {
		return fmt.Errorf("set shortcut working directory: %w", err)
	}
	iconPath := shellPath
	candidates := []string{
		filepath.Join(filepath.Dir(shellPath), "aegis_shell.ico"),
		filepath.Join(filepath.Dir(shellPath), "assets", "aegis_shell.ico"),
		filepath.Join(filepath.Dir(shellPath), "aegisdesk.ico"),
	}
	for _, candidate := range candidates {
		if fileExists(candidate) {
			iconPath = candidate
			break
		}
	}
	if _, err := oleutil.PutProperty(shortcut, "IconLocation", iconPath+",0"); err != nil {
		return fmt.Errorf("set shortcut icon: %w", err)
	}
	if _, err := oleutil.CallMethod(shortcut, "Save"); err != nil {
		return fmt.Errorf("save shortcut: %w", err)
	}
	return nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
