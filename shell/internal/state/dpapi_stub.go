//go:build !windows

package state

import "errors"

func saveProtectedToken(string, string) error {
	return errors.New("DPAPI is only available on Windows")
}

func loadProtectedToken(string) (string, error) {
	return "", errors.New("DPAPI is only available on Windows")
}

func applyStateACL(string) error { return nil }
