//go:build windows

package ui

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"
	"unsafe"

	"aegisdesk-shell/internal/state"
)

type bitmapInfoHeader struct {
	BiSize          uint32
	BiWidth         int32
	BiHeight        int32
	BiPlanes        uint16
	BiBitCount      uint16
	BiCompression   uint32
	BiSizeImage     uint32
	BiXPelsPerMeter int32
	BiYPelsPerMeter int32
	BiClrUsed       uint32
	BiClrImportant  uint32
}

func renderSupportDialogToPNG(opts SupportOptions, outputPath string) error {
	pCreateDIBSection := gdi32.NewProc("CreateDIBSection")

	d := &nativeSupportDialog{
		opts:  opts,
		scale: 1.0,
	}
	d.initFontsAndBrushes()
	d.loadIcons()
	defer d.cleanup()

	w := 440
	h := 490

	memHDC, _, _ := pCreateCompatibleDC.Call(0)
	defer pDeleteDC.Call(memHDC)

	bmi := bitmapInfoHeader{
		BiSize:        uint32(unsafe.Sizeof(bitmapInfoHeader{})),
		BiWidth:       int32(w),
		BiHeight:      -int32(h), // top-down DIB
		BiPlanes:      1,
		BiBitCount:    32,
		BiCompression: 0, // BI_RGB
	}

	var bits unsafe.Pointer
	hBitmap, _, _ := pCreateDIBSection.Call(memHDC, uintptr(unsafe.Pointer(&bmi)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
	if hBitmap == 0 || bits == nil {
		return os.ErrInvalid
	}
	defer pDeleteObject.Call(hBitmap)

	oldBmp, _, _ := pSelectObject.Call(memHDC, hBitmap)
	defer pSelectObject.Call(memHDC, oldBmp)

	// Fill background
	clientR := rect{0, 0, int32(w), int32(h)}
	pFillRect.Call(memHDC, uintptr(unsafe.Pointer(&clientR)), d.brushBg)
	pSetBkMode.Call(memHDC, transparent)

	// Draw content
	d.drawContent(memHDC, w, h)

	// Draw buttons for preview
	btnW := d.dp(115)
	btnH := d.dp(32)
	btnY := h - d.dp(68)
	btnSpacing := d.dp(10)
	btnX := w - d.dp(24) - (btnW * 2) - btnSpacing
	closeBtnX := btnX + btnW + btnSpacing

	// Draw "Abrir ticket" button
	btnPrimaryBrush, _, _ := pCreateSolidBrush.Call(uintptr(rgb(37, 99, 235))) // blue-600
	btnPrimaryPen, _, _ := pCreatePen.Call(0, 1, uintptr(rgb(29, 78, 216)))
	oldB, _, _ := pSelectObject.Call(memHDC, btnPrimaryBrush)
	oldP, _, _ := pSelectObject.Call(memHDC, btnPrimaryPen)
	pRoundRect.Call(memHDC, uintptr(btnX), uintptr(btnY), uintptr(btnX+btnW), uintptr(btnY+btnH), 6, 6)
	pSelectObject.Call(memHDC, uintptr(d.fontButton))
	pSetTextColor.Call(memHDC, uintptr(rgb(255, 255, 255)))
	drawText(memHDC, "Abrir ticket", btnX, btnY, btnW, btnH, dtSingleLine|dtVCenter|0x00000001) // 1=dtCenter
	pSelectObject.Call(memHDC, oldB)
	pSelectObject.Call(memHDC, oldP)
	pDeleteObject.Call(btnPrimaryBrush)
	pDeleteObject.Call(btnPrimaryPen)

	// Draw "Cerrar" button
	btnCloseBrush, _, _ := pCreateSolidBrush.Call(uintptr(rgb(243, 244, 246))) // gray-100
	btnClosePen, _, _ := pCreatePen.Call(0, 1, uintptr(rgb(209, 213, 219)))
	oldB2, _, _ := pSelectObject.Call(memHDC, btnCloseBrush)
	oldP2, _, _ := pSelectObject.Call(memHDC, btnClosePen)
	pRoundRect.Call(memHDC, uintptr(closeBtnX), uintptr(btnY), uintptr(closeBtnX+btnW), uintptr(btnY+btnH), 6, 6)
	pSelectObject.Call(memHDC, uintptr(d.fontButton))
	pSetTextColor.Call(memHDC, uintptr(rgb(55, 65, 81)))
	drawText(memHDC, "Cerrar", closeBtnX, btnY, btnW, btnH, dtSingleLine|dtVCenter|0x00000001)
	pSelectObject.Call(memHDC, oldB2)
	pSelectObject.Call(memHDC, oldP2)
	pDeleteObject.Call(btnCloseBrush)
	pDeleteObject.Call(btnClosePen)

	// Convert DIB memory to Go image
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	pixelSlice := (*[1 << 28]byte)(bits)[: w*h*4 : w*h*4]

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			offset := (y*w + x) * 4
			b := pixelSlice[offset]
			g := pixelSlice[offset+1]
			r := pixelSlice[offset+2]
			img.Set(x, y, color.RGBA{R: r, G: g, B: b, A: 255})
		}
	}

	outFile, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer outFile.Close()
	return png.Encode(outFile, img)
}

func TestRenderPreviews(t *testing.T) {
	cycle := "2027-01-28T18:00:00Z"
	lastOpened := time.Now().UTC().Add(-2 * time.Minute).Format(time.RFC3339)

	activeConfig := state.ShellConfig{
		SchemaVersion: 1,
		Installation: state.InstallationConfig{
			ID:             "inst-1",
			Status:         "active",
			CycleExpiresAt: &cycle,
			Device: state.DeviceInfo{
				Name:         "KernelOS-PC",
				LastOpenedAt: &lastOpened,
			},
			Organization: &state.OrganizationInfo{ID: "org-1", Name: "FEMUCARIBE"},
			Group:        &state.GroupInfo{ID: "grp-1", Name: "Administración"},
			User:         &state.AssignedUserInfo{ID: "usr-1", DisplayName: "Rocío Vargas"},
		},
		Support: state.SupportConfig{
			Title:    "AegisDesk",
			Message:  "¿Necesitás ayuda con SIDC?\nPodemos ayudarte con acceso, errores o funcionamiento del sistema.",
			AreaName: "TI FEMUCARIBE",
			Hours:    "L–V 8:00 a. m. – 4:00 p. m.",
			Contacts: []state.SupportContact{
				{Type: "email", Label: "Correo", Value: "mailto:soporte@femucaribe.test"},
				{Type: "phone", Label: "Teléfono", Value: "tel:+50622223333"},
			},
			Links: []state.SupportLink{
				{Label: "Abrir ticket", URL: "https://aegisdesk.tonyml.com/tickets"},
			},
		},
	}

	outDir := os.Getenv("PREVIEW_DIR")
	if outDir == "" {
		outDir = t.TempDir()
	}
	activePath := filepath.Join(outDir, "preview_support_active.png")
	if err := renderSupportDialogToPNG(SupportOptions{
		Config:    activeConfig,
		Status:    "active",
		AutoClose: 4 * time.Second,
	}, activePath); err != nil {
		t.Fatalf("render active support preview: %v", err)
	}

	disabledConfig := activeConfig
	disabledConfig.Installation.Status = "disabled"
	disabledConfig.Support.Message = "El acceso a SIDC está deshabilitado para este equipo.\nContactá al área de soporte si necesitás restablecerlo."
	disabledPath := filepath.Join(outDir, "preview_support_disabled.png")
	if err := renderSupportDialogToPNG(SupportOptions{
		Config:    disabledConfig,
		Status:    "disabled",
		AutoClose: 0,
	}, disabledPath); err != nil {
		t.Fatalf("render disabled support preview: %v", err)
	}
}
