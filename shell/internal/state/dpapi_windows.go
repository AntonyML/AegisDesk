//go:build windows

package state

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

func saveProtectedToken(path, token string) error {
	data := []byte(token)
	input := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var output windows.DataBlob
	if err := windows.CryptProtectData(&input, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output); err != nil {
		return fmt.Errorf("CryptProtectData: %w", err)
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(output.Data)))
	protected := unsafe.Slice(output.Data, output.Size)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, protected, 0o600); err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func loadProtectedToken(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if len(data) == 0 || len(data) > 64*1024 {
		return "", fmt.Errorf("protected token has invalid size")
	}
	input := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var output windows.DataBlob
	if err := windows.CryptUnprotectData(&input, nil, nil, 0, nil, 0, &output); err != nil {
		return "", fmt.Errorf("CryptUnprotectData: %w", err)
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(output.Data)))
	return string(unsafe.Slice(output.Data, output.Size)), nil
}

func applyStateACL(root string) error {
	current, err := user.Current()
	if err != nil {
		return fmt.Errorf("resolve current Windows user: %w", err)
	}
	if current.Username == "" {
		return fmt.Errorf("resolve current Windows user: empty username")
	}
	principal := current.Username
	if strings.HasPrefix(current.Uid, "S-") {
		principal = "*" + current.Uid
	}
	args := []string{
		root,
		"/inheritance:r",
		"/grant:r", principal + ":(OI)(CI)F",
		"*S-1-5-18:(OI)(CI)F",
		"*S-1-5-32-544:(OI)(CI)F",
	}
	command := exec.Command("icacls.exe", args...)
	command.Stdout = io.Discard
	command.Stderr = io.Discard
	if err := command.Run(); err != nil {
		return err
	}
	return nil
}
