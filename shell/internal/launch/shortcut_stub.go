//go:build !windows

package launch

import "fmt"

func CreateDesktopShortcut(_, _, _ string) error {
	return fmt.Errorf("desktop shortcuts are supported only on Windows")
}
