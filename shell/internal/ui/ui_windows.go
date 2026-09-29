//go:build windows

package ui

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"aegisdesk-shell/internal/assets"
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	gdi32    = windows.NewLazySystemDLL("gdi32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	pRegisterClassExW              = user32.NewProc("RegisterClassExW")
	pCreateWindowExW               = user32.NewProc("CreateWindowExW")
	pDefWindowProcW                = user32.NewProc("DefWindowProcW")
	pDestroyWindow                 = user32.NewProc("DestroyWindow")
	pShowWindow                    = user32.NewProc("ShowWindow")
	pUpdateWindow                  = user32.NewProc("UpdateWindow")
	pGetMessageW                   = user32.NewProc("GetMessageW")
	pTranslateMessage              = user32.NewProc("TranslateMessage")
	pDispatchMessageW              = user32.NewProc("DispatchMessageW")
	pPostQuitMessage               = user32.NewProc("PostQuitMessage")
	pBeginPaint                    = user32.NewProc("BeginPaint")
	pEndPaint                      = user32.NewProc("EndPaint")
	pGetClientRect                 = user32.NewProc("GetClientRect")
	pDrawTextW                     = user32.NewProc("DrawTextW")
	pFillRect                      = user32.NewProc("FillRect")
	pSetTimer                      = user32.NewProc("SetTimer")
	pKillTimer                     = user32.NewProc("KillTimer")
	pSendMessageW                  = user32.NewProc("SendMessageW")
	pLoadImageW                    = user32.NewProc("LoadImageW")
	pDestroyIcon                   = user32.NewProc("DestroyIcon")
	pSetWindowPos                  = user32.NewProc("SetWindowPos")
	pGetSystemMetrics              = user32.NewProc("GetSystemMetrics")
	pGetDpiForWindow               = user32.NewProc("GetDpiForWindow")
	pSetProcessDpiAwarenessContext = user32.NewProc("SetProcessDpiAwarenessContext")

	pCreateFontW            = gdi32.NewProc("CreateFontW")
	pCreateSolidBrush       = gdi32.NewProc("CreateSolidBrush")
	pCreatePen              = gdi32.NewProc("CreatePen")
	pSelectObject           = gdi32.NewProc("SelectObject")
	pDeleteObject           = gdi32.NewProc("DeleteObject")
	pSetTextColor           = gdi32.NewProc("SetTextColor")
	pSetBkMode              = gdi32.NewProc("SetBkMode")
	pSetBkColor             = gdi32.NewProc("SetBkColor")
	pRoundRect              = gdi32.NewProc("RoundRect")
	pCreateCompatibleDC     = gdi32.NewProc("CreateCompatibleDC")
	pCreateCompatibleBitmap = gdi32.NewProc("CreateCompatibleBitmap")
	pBitBlt                 = gdi32.NewProc("BitBlt")
	pDeleteDC               = gdi32.NewProc("DeleteDC")
)

const (
	wsOverlapped    = 0x00000000
	wsCaption       = 0x00C00000
	wsSysMenu       = 0x00080000
	wsVisible       = 0x10000000
	wsChild         = 0x40000000
	wsTabStop       = 0x00010000
	bsDefPushButton = 0x00000001
	bsPushButton    = 0x00000000
	swShowNormal    = 1
	wmDestroy       = 0x0002
	wmPaint         = 0x000F
	wmClose         = 0x0010
	wmCommand       = 0x0111
	wmTimer         = 0x0113
	wmKeyDown       = 0x0100
	wmSetFont       = 0x0030
	wmSetIcon       = 0x0080
	iconSmall       = 0
	iconBig         = 1
	imageIcon       = 1
	lrLoadFromFile  = 0x0010
	transparent     = 1
	dtLeft          = 0x00000000
	dtSingleLine    = 0x00000020
	dtWordBreak     = 0x00000010
	dtCalcRect      = 0x00000400
	dtVCenter       = 0x00000004
	srccopy         = 0x00CC0020
	vkEscape        = 0x1B
	vkReturn        = 0x0D
	idBtnTicket     = 101
	idBtnClose      = 102
	colorWindow     = 5
)

type rect struct {
	Left, Top, Right, Bottom int32
}

type paintStruct struct {
	Hdc         uintptr
	FErase      int32
	RcPaint     rect
	FRestore    int32
	FIncUpdate  int32
	RgbReserved [32]byte
}

type msg struct {
	Hwnd    uintptr
	Message uint32
	Wparam  uintptr
	Lparam  uintptr
	Time    uint32
	Pt      struct{ X, Y int32 }
}

type wndClassExW struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

var (
	regClassOnce sync.Once
	activeDialog *nativeSupportDialog
)

type nativeSupportDialog struct {
	opts             SupportOptions
	scale            float64
	hwnd             uintptr
	hBtnTicket       uintptr
	hBtnClose        uintptr
	hIconBig         uintptr
	hIconSm          uintptr
	timerRemaining   int
	timerActive      bool
	fontTitle        uintptr
	fontSubtitle     uintptr
	fontSection      uintptr
	fontBody         uintptr
	fontBodyBold     uintptr
	fontCaption      uintptr
	fontButton       uintptr
	brushBg          uintptr
	brushCard        uintptr
	penCardBorder    uintptr
	penNoticeBorder  uintptr
	brushNoticeBg    uintptr
	primaryTicketURL string
}

func initDPIAwareness() {
	if pSetProcessDpiAwarenessContext.Find() == nil {
		// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
		_, _, _ = pSetProcessDpiAwarenessContext.Call(uintptr(0xfffffffffffffffc))
	}
}

func (d *nativeSupportDialog) dp(val int) int {
	return int(float64(val) * d.scale)
}

func rgb(r, g, b byte) uint32 {
	return uint32(r) | (uint32(g) << 8) | (uint32(b) << 16)
}

func showNativeSupportDialog(ctx context.Context, opts SupportOptions) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	initDPIAwareness()

	d := &nativeSupportDialog{
		opts:  opts,
		scale: 1.0,
	}
	activeDialog = d
	defer func() {
		activeDialog = nil
	}()

	className, err := windows.UTF16PtrFromString("AegisDeskSupportWindow")
	if err != nil {
		return err
	}

	hInstance := uintptr(0)

	regClassOnce.Do(func() {
		wc := wndClassExW{
			CbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
			Style:         0x0003, // CS_HREDRAW | CS_VREDRAW
			LpfnWndProc:   windows.NewCallback(dialogWndProc),
			HInstance:     hInstance,
			HCursor:       loadCursor(32512), // IDC_ARROW
			HbrBackground: uintptr(colorWindow + 1),
			LpszClassName: className,
		}
		pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	})

	screenW, _, _ := pGetSystemMetrics.Call(0)
	screenH, _, _ := pGetSystemMetrics.Call(1)

	windowTitle := "AegisDesk"
	if opts.Status == "disabled" {
		windowTitle = "AegisDesk · Acceso deshabilitado"
	} else if opts.Config.Support.Title != "" {
		windowTitle = opts.Config.Support.Title
	}
	wTitlePtr, _ := windows.UTF16PtrFromString(windowTitle)

	dwStyle := wsOverlapped | wsCaption | wsSysMenu

	hwnd, _, _ := pCreateWindowExW.Call(
		0x00000000,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(wTitlePtr)),
		uintptr(dwStyle),
		uintptr(0x80000000), // CW_USEDEFAULT
		uintptr(0x80000000),
		uintptr(460),
		uintptr(560),
		0, 0,
		hInstance,
		0,
	)
	if hwnd == 0 {
		return fmt.Errorf("failed to create support window")
	}
	d.hwnd = hwnd

	if pGetDpiForWindow.Find() == nil {
		dpi, _, _ := pGetDpiForWindow.Call(hwnd)
		if dpi > 0 {
			d.scale = float64(dpi) / 96.0
		}
	}
	if d.scale < 1.0 {
		d.scale = 1.0
	}

	d.initFontsAndBrushes()
	d.loadIcons()
	if d.hIconBig != 0 {
		pSendMessageW.Call(hwnd, wmSetIcon, iconBig, d.hIconBig)
	}
	if d.hIconSm != 0 {
		pSendMessageW.Call(hwnd, wmSetIcon, iconSmall, d.hIconSm)
	}

	winW := d.dp(440)
	winH := d.dp(490)
	posX := (int(screenW) - winW) / 2
	posY := (int(screenH) - winH) / 2
	if posX < 0 {
		posX = 100
	}
	if posY < 0 {
		posY = 100
	}
	pSetWindowPos.Call(hwnd, 0, uintptr(posX), uintptr(posY), uintptr(winW), uintptr(winH), 0x0040)

	btnW := d.dp(115)
	btnH := d.dp(32)
	btnY := winH - d.dp(68)
	btnSpacing := d.dp(10)

	ticketURL := ""
	for _, link := range opts.Config.Support.Links {
		if strings.EqualFold(link.Label, "Abrir ticket") || strings.Contains(strings.ToLower(link.Label), "ticket") {
			ticketURL = link.URL
			break
		}
	}
	if ticketURL == "" && len(opts.Config.Support.Links) > 0 {
		ticketURL = opts.Config.Support.Links[0].URL
	}
	if ticketURL == "" {
		for _, contact := range opts.Config.Support.Contacts {
			if contact.Type == "email" && IsSafeURL(contact.Value) {
				ticketURL = contact.Value
				break
			}
		}
	}
	d.primaryTicketURL = ticketURL

	btnFontPtr := d.fontButton
	btnClass, _ := windows.UTF16PtrFromString("BUTTON")

	// Abrir ticket button (Primary)
	ticketLabel := "Abrir ticket"
	if ticketURL == "" {
		ticketLabel = "Soporte"
	}
	ticketTextPtr, _ := windows.UTF16PtrFromString(ticketLabel)
	btnX := winW - d.dp(24) - (btnW * 2) - btnSpacing
	hTicket, _, _ := pCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(btnClass)),
		uintptr(unsafe.Pointer(ticketTextPtr)),
		uintptr(wsChild|wsVisible|wsTabStop|bsDefPushButton),
		uintptr(btnX),
		uintptr(btnY),
		uintptr(btnW),
		uintptr(btnH),
		hwnd,
		uintptr(idBtnTicket),
		hInstance,
		0,
	)
	d.hBtnTicket = hTicket
	pSendMessageW.Call(d.hBtnTicket, wmSetFont, btnFontPtr, 1)

	// Single Cerrar button (Secondary)
	closeTextPtr, _ := windows.UTF16PtrFromString("Cerrar")
	closeBtnX := btnX + btnW + btnSpacing
	hClose, _, _ := pCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(btnClass)),
		uintptr(unsafe.Pointer(closeTextPtr)),
		uintptr(wsChild|wsVisible|wsTabStop|bsPushButton),
		uintptr(closeBtnX),
		uintptr(btnY),
		uintptr(btnW),
		uintptr(btnH),
		hwnd,
		uintptr(idBtnClose),
		hInstance,
		0,
	)
	d.hBtnClose = hClose
	pSendMessageW.Call(d.hBtnClose, wmSetFont, btnFontPtr, 1)

	// Auto-close timer only on normal active launches
	if opts.Status != "disabled" && opts.AutoClose > 0 {
		d.timerRemaining = int(opts.AutoClose.Seconds())
		if d.timerRemaining <= 0 {
			d.timerRemaining = 4
		}
		d.timerActive = true
		pSetTimer.Call(hwnd, 1, 1000, 0)
	}

	pShowWindow.Call(hwnd, swShowNormal)
	pUpdateWindow.Call(hwnd)

	var m msg
	for {
		select {
		case <-ctx.Done():
			pDestroyWindow.Call(hwnd)
			return ctx.Err()
		default:
		}

		ret, _, _ := pGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		pDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}

	d.cleanup()
	return nil
}

func (d *nativeSupportDialog) initFontsAndBrushes() {
	segoe, _ := windows.UTF16PtrFromString("Segoe UI")
	segoeBold, _ := windows.UTF16PtrFromString("Segoe UI Semibold")

	createFont := func(sizePt int, weight int, face *uint16) uintptr {
		height := -d.dp(sizePt)
		h, _, _ := pCreateFontW.Call(
			uintptr(height), 0, 0, 0,
			uintptr(weight),
			0, 0, 0, 1, 0, 0, 5, 0,
			uintptr(unsafe.Pointer(face)),
		)
		return h
	}

	d.fontTitle = createFont(18, 700, segoeBold)
	d.fontSubtitle = createFont(11, 400, segoe)
	d.fontSection = createFont(9, 700, segoeBold)
	d.fontBody = createFont(10, 400, segoe)
	d.fontBodyBold = createFont(10, 600, segoeBold)
	d.fontCaption = createFont(9, 400, segoe)
	d.fontButton = createFont(10, 600, segoeBold)

	hBg, _, _ := pCreateSolidBrush.Call(uintptr(rgb(255, 255, 255)))
	d.brushBg = hBg

	hCard, _, _ := pCreateSolidBrush.Call(uintptr(rgb(248, 250, 252)))
	d.brushCard = hCard

	hBorder, _, _ := pCreatePen.Call(0, 1, uintptr(rgb(226, 232, 240)))
	d.penCardBorder = hBorder

	hNoticeBg, _, _ := pCreateSolidBrush.Call(uintptr(rgb(254, 243, 199)))
	d.brushNoticeBg = hNoticeBg

	hNoticeBorder, _, _ := pCreatePen.Call(0, 1, uintptr(rgb(245, 158, 11)))
	d.penNoticeBorder = hNoticeBorder
}

func (d *nativeSupportDialog) loadIcons() {
	exePath, err := os.Executable()
	var icoPath string
	if err == nil {
		candidates := []string{
			filepath.Join(filepath.Dir(exePath), "aegis_shell.ico"),
			filepath.Join(filepath.Dir(exePath), "assets", "aegis_shell.ico"),
			filepath.Join(filepath.Dir(exePath), "aegisdesk.ico"),
		}
		for _, c := range candidates {
			if info, e := os.Stat(c); e == nil && !info.IsDir() {
				icoPath = c
				break
			}
		}
	}

	if icoPath == "" && len(assets.ShellIconICO) > 0 {
		tmp := filepath.Join(os.TempDir(), "aegis_shell.ico")
		if err := os.WriteFile(tmp, assets.ShellIconICO, 0o644); err == nil {
			icoPath = tmp
		}
	}

	if icoPath != "" {
		pPath, _ := windows.UTF16PtrFromString(icoPath)
		hBig, _, _ := pLoadImageW.Call(0, uintptr(unsafe.Pointer(pPath)), imageIcon, uintptr(d.dp(32)), uintptr(d.dp(32)), lrLoadFromFile)
		d.hIconBig = hBig

		hSm, _, _ := pLoadImageW.Call(0, uintptr(unsafe.Pointer(pPath)), imageIcon, uintptr(d.dp(16)), uintptr(d.dp(16)), lrLoadFromFile)
		d.hIconSm = hSm
	}
}

func (d *nativeSupportDialog) cleanup() {
	if d.timerActive {
		pKillTimer.Call(d.hwnd, 1)
		d.timerActive = false
	}
	deleteObj := func(h uintptr) {
		if h != 0 {
			pDeleteObject.Call(h)
		}
	}
	deleteObj(d.fontTitle)
	deleteObj(d.fontSubtitle)
	deleteObj(d.fontSection)
	deleteObj(d.fontBody)
	deleteObj(d.fontBodyBold)
	deleteObj(d.fontCaption)
	deleteObj(d.fontButton)
	deleteObj(d.brushBg)
	deleteObj(d.brushCard)
	deleteObj(d.penCardBorder)
	deleteObj(d.brushNoticeBg)
	deleteObj(d.penNoticeBorder)

	if d.hIconBig != 0 {
		pDestroyIcon.Call(d.hIconBig)
	}
	if d.hIconSm != 0 {
		pDestroyIcon.Call(d.hIconSm)
	}
}

func loadCursor(id uintptr) uintptr {
	pLoadCursorW := user32.NewProc("LoadCursorW")
	h, _, _ := pLoadCursorW.Call(0, id)
	return h
}

func dialogWndProc(hwnd uintptr, msg uint32, wparam uintptr, lparam uintptr) uintptr {
	d := activeDialog
	if d == nil {
		r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(msg), wparam, lparam)
		return r
	}

	switch msg {
	case wmPaint:
		d.onPaint(hwnd)
		return 0

	case wmTimer:
		if wparam == 1 && d.timerActive {
			d.timerRemaining--
			if d.timerRemaining <= 0 {
				pKillTimer.Call(hwnd, 1)
				d.timerActive = false
				pDestroyWindow.Call(hwnd)
				return 0
			}
			r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(msg), wparam, lparam)
			return r
		}

	case wmCommand:
		ctrlID := int(wparam & 0xFFFF)
		switch ctrlID {
		case idBtnTicket:
			if d.timerActive {
				pKillTimer.Call(hwnd, 1)
				d.timerActive = false
			}
			if d.primaryTicketURL != "" {
				_ = OpenSafeURL(d.primaryTicketURL)
			}
			return 0
		case idBtnClose:
			if d.timerActive {
				pKillTimer.Call(hwnd, 1)
				d.timerActive = false
			}
			pDestroyWindow.Call(hwnd)
			return 0
		}

	case wmKeyDown:
		if wparam == vkEscape {
			if d.timerActive {
				pKillTimer.Call(hwnd, 1)
				d.timerActive = false
			}
			pDestroyWindow.Call(hwnd)
			return 0
		} else if wparam == vkReturn {
			if d.primaryTicketURL != "" {
				if d.timerActive {
					pKillTimer.Call(hwnd, 1)
					d.timerActive = false
				}
				_ = OpenSafeURL(d.primaryTicketURL)
			}
			return 0
		}

	case wmClose:
		if d.timerActive {
			pKillTimer.Call(hwnd, 1)
			d.timerActive = false
		}
		pDestroyWindow.Call(hwnd)
		return 0

	case wmDestroy:
		pPostQuitMessage.Call(0)
		return 0
	}

	r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(msg), wparam, lparam)
	return r
}

func (d *nativeSupportDialog) onPaint(hwnd uintptr) {
	var ps paintStruct
	hdc, _, _ := pBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	if hdc == 0 {
		return
	}
	defer pEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))

	var clientRect rect
	pGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&clientRect)))

	w := int(clientRect.Right)
	h := int(clientRect.Bottom)

	memHDC, _, _ := pCreateCompatibleDC.Call(hdc)
	memBitmap, _, _ := pCreateCompatibleBitmap.Call(hdc, uintptr(w), uintptr(h))
	oldBmp, _, _ := pSelectObject.Call(memHDC, memBitmap)

	pFillRect.Call(memHDC, uintptr(unsafe.Pointer(&clientRect)), d.brushBg)
	pSetBkMode.Call(memHDC, transparent)

	d.drawContent(memHDC, w, h)

	pBitBlt.Call(hdc, 0, 0, uintptr(w), uintptr(h), memHDC, 0, 0, srccopy)

	pSelectObject.Call(memHDC, oldBmp)
	pDeleteObject.Call(memBitmap)
	pDeleteDC.Call(memHDC)
}

func (d *nativeSupportDialog) drawContent(hdc uintptr, winW, winH int) {
	marginX := d.dp(24)
	contentW := winW - (marginX * 2)
	curY := d.dp(20)

	// Header Icon
	pDrawIconEx := user32.NewProc("DrawIconEx")
	if d.hIconBig != 0 && pDrawIconEx.Find() == nil {
		iconSize := d.dp(32)
		pDrawIconEx.Call(hdc, uintptr(marginX), uintptr(curY), d.hIconBig, uintptr(iconSize), uintptr(iconSize), 0, 0, 0x0003)
	}

	textStartX := marginX + d.dp(40)
	titleText := "AegisDesk"
	subText := "Soporte"
	if d.opts.Status == "disabled" {
		titleText = "AegisDesk"
		subText = "Acceso deshabilitado"
	} else if d.opts.Config.Support.Title != "" {
		titleText = d.opts.Config.Support.Title
	}

	pSelectObject.Call(hdc, d.fontTitle)
	pSetTextColor.Call(hdc, uintptr(rgb(17, 24, 39)))
	drawText(hdc, titleText, textStartX, curY, contentW-d.dp(40), d.dp(24), dtLeft|dtSingleLine)

	pSelectObject.Call(hdc, d.fontSubtitle)
	if d.opts.Status == "disabled" {
		pSetTextColor.Call(hdc, uintptr(rgb(220, 38, 38)))
	} else {
		pSetTextColor.Call(hdc, uintptr(rgb(107, 114, 128)))
	}
	drawText(hdc, subText, textStartX, curY+d.dp(24), contentW-d.dp(40), d.dp(18), dtLeft|dtSingleLine)

	curY += d.dp(52)

	// Message
	pSelectObject.Call(hdc, d.fontBody)
	pSetTextColor.Call(hdc, uintptr(rgb(55, 65, 81)))
	mainMsg := "¿Necesitás ayuda con SIDC?\nPodemos ayudarte con acceso, errores o funcionamiento del sistema."
	if d.opts.Status == "disabled" {
		mainMsg = "El acceso a SIDC está deshabilitado para este equipo.\nContactá al área de soporte si necesitás restablecerlo."
	} else if d.opts.Config.Support.Message != "" {
		mainMsg = d.opts.Config.Support.Message
	}
	msgH := measureTextHeight(hdc, mainMsg, contentW, d.fontBody)
	drawText(hdc, mainMsg, marginX, curY, contentW, msgH, dtLeft|dtWordBreak)
	curY += msgH + d.dp(16)

	// Device Card
	inst := d.opts.Config.Installation
	devName := inst.Device.Name
	if devName == "" {
		devName, _ = os.Hostname()
	}

	orgGroupLine := ""
	if inst.Organization != nil && inst.Organization.Name != "" && inst.Group != nil && inst.Group.Name != "" {
		orgGroupLine = fmt.Sprintf("%s · %s", inst.Organization.Name, inst.Group.Name)
	} else if inst.Organization != nil && inst.Organization.Name != "" {
		orgGroupLine = inst.Organization.Name
	} else if inst.Group != nil && inst.Group.Name != "" {
		orgGroupLine = inst.Group.Name
	}

	userLine := ""
	if inst.User != nil && inst.User.DisplayName != "" {
		userLine = fmt.Sprintf("Usuario: %s", inst.User.DisplayName)
	}

	cardPad := d.dp(12)
	cardLines := 2
	if orgGroupLine != "" {
		cardLines++
	}
	if userLine != "" {
		cardLines++
	}
	cardH := cardPad*2 + (cardLines * d.dp(18))

	oldBrush, _, _ := pSelectObject.Call(hdc, d.brushCard)
	oldPen, _, _ := pSelectObject.Call(hdc, d.penCardBorder)
	cardR := d.dp(8)
	pRoundRect.Call(hdc, uintptr(marginX), uintptr(curY), uintptr(marginX+contentW), uintptr(curY+cardH), uintptr(cardR), uintptr(cardR))
	pSelectObject.Call(hdc, oldBrush)
	pSelectObject.Call(hdc, oldPen)

	innerY := curY + cardPad
	pSelectObject.Call(hdc, d.fontSection)
	pSetTextColor.Call(hdc, uintptr(rgb(100, 116, 139)))
	drawText(hdc, "TU EQUIPO", marginX+cardPad, innerY, contentW-(cardPad*2), d.dp(16), dtLeft|dtSingleLine)
	innerY += d.dp(16)

	pSelectObject.Call(hdc, d.fontBodyBold)
	pSetTextColor.Call(hdc, uintptr(rgb(15, 23, 42)))
	drawText(hdc, devName, marginX+cardPad, innerY, contentW-(cardPad*2), d.dp(18), dtLeft|dtSingleLine)
	innerY += d.dp(18)

	if orgGroupLine != "" {
		pSelectObject.Call(hdc, d.fontBody)
		pSetTextColor.Call(hdc, uintptr(rgb(51, 65, 85)))
		drawText(hdc, orgGroupLine, marginX+cardPad, innerY, contentW-(cardPad*2), d.dp(18), dtLeft|dtSingleLine)
		innerY += d.dp(18)
	}

	if userLine != "" {
		pSelectObject.Call(hdc, d.fontCaption)
		pSetTextColor.Call(hdc, uintptr(rgb(71, 85, 105)))
		drawText(hdc, userLine, marginX+cardPad, innerY, contentW-(cardPad*2), d.dp(16), dtLeft|dtSingleLine)
	}

	curY += cardH + d.dp(14)

	// Status Section
	pSelectObject.Call(hdc, d.fontSection)
	pSetTextColor.Call(hdc, uintptr(rgb(100, 116, 139)))
	drawText(hdc, "ESTADO", marginX, curY, contentW, d.dp(16), dtLeft|dtSingleLine)
	curY += d.dp(16)

	pSelectObject.Call(hdc, d.fontBodyBold)
	if d.opts.Status == "disabled" {
		pSetTextColor.Call(hdc, uintptr(rgb(220, 38, 38)))
		drawText(hdc, "■ Acceso deshabilitado", marginX, curY, contentW, d.dp(18), dtLeft|dtSingleLine)
	} else if d.opts.IsOffline {
		pSetTextColor.Call(hdc, uintptr(rgb(71, 85, 105)))
		drawText(hdc, "○ Sin conexión (usando configuración guardada)", marginX, curY, contentW, d.dp(18), dtLeft|dtSingleLine)
	} else {
		pSetTextColor.Call(hdc, uintptr(rgb(16, 185, 129)))
		drawText(hdc, "● Activo", marginX, curY, contentW, d.dp(18), dtLeft|dtSingleLine)
	}
	curY += d.dp(18)

	cycleDate := FormatCycleDate(inst.CycleExpiresAt)
	if cycleDate != "" {
		pSelectObject.Call(hdc, d.fontCaption)
		pSetTextColor.Call(hdc, uintptr(rgb(100, 116, 139)))
		drawText(hdc, fmt.Sprintf("Ciclo: %s", cycleDate), marginX, curY, contentW, d.dp(16), dtLeft|dtSingleLine)
		curY += d.dp(16)
	}

	syncText := FormatRelativeSync(inst.Device.LastOpenedAt, time.Now().UTC())
	if syncText != "" {
		pSelectObject.Call(hdc, d.fontCaption)
		pSetTextColor.Call(hdc, uintptr(rgb(100, 116, 139)))
		drawText(hdc, fmt.Sprintf("Última sincronización: %s", syncText), marginX, curY, contentW, d.dp(16), dtLeft|dtSingleLine)
		curY += d.dp(16)
	}

	curY += d.dp(10)

	// Support Section
	supp := d.opts.Config.Support
	hasSupportInfo := supp.AreaName != "" || len(supp.Contacts) > 0 || supp.Hours != "" || supp.Notice != ""
	if hasSupportInfo {
		pSelectObject.Call(hdc, d.fontSection)
		pSetTextColor.Call(hdc, uintptr(rgb(100, 116, 139)))
		drawText(hdc, "SOPORTE", marginX, curY, contentW, d.dp(16), dtLeft|dtSingleLine)
		curY += d.dp(16)

		if supp.AreaName != "" {
			pSelectObject.Call(hdc, d.fontBodyBold)
			pSetTextColor.Call(hdc, uintptr(rgb(30, 41, 59)))
			drawText(hdc, supp.AreaName, marginX, curY, contentW, d.dp(18), dtLeft|dtSingleLine)
			curY += d.dp(18)
		}

		for _, contact := range supp.Contacts {
			val := contact.Value
			if strings.HasPrefix(val, "mailto:") {
				val = strings.TrimPrefix(val, "mailto:")
			} else if strings.HasPrefix(val, "tel:") {
				val = strings.TrimPrefix(val, "tel:")
			}
			pSelectObject.Call(hdc, d.fontBody)
			pSetTextColor.Call(hdc, uintptr(rgb(37, 99, 235)))
			drawText(hdc, fmt.Sprintf("%s: %s", contact.Label, val), marginX, curY, contentW, d.dp(18), dtLeft|dtSingleLine)
			curY += d.dp(18)
		}

		if supp.Hours != "" {
			pSelectObject.Call(hdc, d.fontCaption)
			pSetTextColor.Call(hdc, uintptr(rgb(100, 116, 139)))
			drawText(hdc, supp.Hours, marginX, curY, contentW, d.dp(16), dtLeft|dtSingleLine)
			curY += d.dp(16)
		}

		if supp.Notice != "" {
			curY += d.dp(4)
			noticePad := d.dp(8)
			noticeH := d.dp(28)
			oldBrush, _, _ := pSelectObject.Call(hdc, d.brushNoticeBg)
			oldPen, _, _ := pSelectObject.Call(hdc, d.penNoticeBorder)
			pRoundRect.Call(hdc, uintptr(marginX), uintptr(curY), uintptr(marginX+contentW), uintptr(curY+noticeH), uintptr(d.dp(4)), uintptr(d.dp(4)))
			pSelectObject.Call(hdc, oldBrush)
			pSelectObject.Call(hdc, oldPen)

			pSelectObject.Call(hdc, d.fontCaption)
			pSetTextColor.Call(hdc, uintptr(rgb(146, 64, 14)))
			drawText(hdc, supp.Notice, marginX+noticePad, curY+d.dp(6), contentW-(noticePad*2), d.dp(16), dtLeft|dtSingleLine)
			curY += noticeH
		}

		for _, link := range supp.Links {
			if strings.EqualFold(link.Label, "Abrir ticket") || link.URL == "" {
				continue
			}
			pSelectObject.Call(hdc, d.fontCaption)
			pSetTextColor.Call(hdc, uintptr(rgb(37, 99, 235)))
			drawText(hdc, fmt.Sprintf("%s: %s", link.Label, link.URL), marginX, curY, contentW, d.dp(16), dtLeft|dtSingleLine)
			curY += d.dp(16)
		}
	}

	if d.timerActive && d.timerRemaining > 0 {
		timerMsg := fmt.Sprintf("Iniciando SIDC en %d s...", d.timerRemaining)
		pSelectObject.Call(hdc, d.fontCaption)
		pSetTextColor.Call(hdc, uintptr(rgb(156, 163, 175)))
		btnY := winH - d.dp(72)
		drawText(hdc, timerMsg, marginX, btnY, d.dp(160), d.dp(20), dtLeft|dtVCenter|dtSingleLine)
	}
}

func drawText(hdc uintptr, text string, x, y, w, h int, flags uint32) {
	if text == "" {
		return
	}
	pStr, err := windows.UTF16PtrFromString(text)
	if err != nil {
		return
	}
	r := rect{
		Left:   int32(x),
		Top:    int32(y),
		Right:  int32(x + w),
		Bottom: int32(y + h),
	}
	pDrawTextW.Call(hdc, uintptr(unsafe.Pointer(pStr)), uintptr(len([]rune(text))), uintptr(unsafe.Pointer(&r)), uintptr(flags))
}

func measureTextHeight(hdc uintptr, text string, width int, font uintptr) int {
	if text == "" {
		return 0
	}
	pStr, err := windows.UTF16PtrFromString(text)
	if err != nil {
		return 0
	}
	pSelectObject.Call(hdc, font)
	r := rect{
		Left:   0,
		Top:    0,
		Right:  int32(width),
		Bottom: 0,
	}
	pDrawTextW.Call(hdc, uintptr(unsafe.Pointer(pStr)), uintptr(len([]rune(text))), uintptr(unsafe.Pointer(&r)), uintptr(dtCalcRect|dtWordBreak))
	return int(r.Bottom - r.Top)
}
