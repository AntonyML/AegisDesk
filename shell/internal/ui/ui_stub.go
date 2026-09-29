//go:build !windows

package ui

import (
	"context"
)

func showNativeSupportDialog(ctx context.Context, opts SupportOptions) error {
	// Stub for non-Windows platforms
	return nil
}
