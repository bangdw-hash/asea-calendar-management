"""
ASEA 캘린더 데스크탑 위젯
Windows 11 투명 오버레이 / 항상 위 표시

설치:  pip install PyQt5 PyQtWebEngine
실행:  python desktop_widget.py  (또는 실행.bat 더블클릭)

기능:
  - 4-모서리 + 4-변 크기 조절 핸들
  - 자석 스냅 — 화면 끝 20px 이내 접근 시 모서리에 달라붙기
  - Win+← / Win+→  : 현재 모니터 좌/우 절반 스냅
  - Win+↑           : 일반 → 상단 절반 → 전체화면  (연속 입력 시 진행)
  - Win+↓           : 전체화면 → 복원 / 상단절반 → 하단절반 / 일반 → 최소화
  - ESC             : 전체화면 / 절반 스냅 해제
  - 타이틀바 더블클릭 : 전체화면 토글
"""

import sys, os, subprocess

if os.name == "nt" and sys.executable.lower().endswith("python.exe"):
    pythonw = sys.executable[:-10] + "pythonw.exe"
    if os.path.exists(pythonw):
        subprocess.Popen([pythonw] + sys.argv)
        sys.exit(0)

os.environ.setdefault("QT_AUTO_SCREEN_SCALE_FACTOR", "1")

from PyQt5.QtCore    import Qt, QUrl, QRect, QPoint
from PyQt5.QtGui     import QFont, QCursor
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QSlider, QLabel, QMenu, QAction
)
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineProfile, QWebEnginePage
from PyQt5.QtPrintSupport import QPrinter, QPrintDialog

CALENDAR_URL = "https://bangdw-hash.github.io/asea-calendar-management/schedule.html"
SNAP_MARGIN  = 20   # 자석 스냅 거리 (px)
RESIZE_EDGE  = 10   # 리사이즈 핸들 두께 (px)
MIN_W, MIN_H = 320, 460

MDL2 = "Segoe MDL2 Assets"
IC_BRIGHT   = chr(0xE706)
IC_MONITOR  = chr(0xE7F4)
IC_FULL     = chr(0xE740)
IC_RESTORE  = chr(0xE73F)
IC_PIN      = chr(0xE718)
IC_UNPIN    = chr(0xE77A)
IC_REFRESH  = chr(0xE72C)
IC_MINIMIZE = chr(0xE921)
IC_CLOSE    = chr(0xE8BB)

# ── 리사이즈 엣지 플래그 ──────────────────────────────────────────────────────
EDGE_NONE   = 0
EDGE_LEFT   = 1
EDGE_RIGHT  = 2
EDGE_TOP    = 4
EDGE_BOTTOM = 8
EDGE_TL     = EDGE_TOP | EDGE_LEFT
EDGE_TR     = EDGE_TOP | EDGE_RIGHT
EDGE_BL     = EDGE_BOTTOM | EDGE_LEFT
EDGE_BR     = EDGE_BOTTOM | EDGE_RIGHT

EDGE_CURSORS = {
    EDGE_LEFT:   Qt.SizeHorCursor,
    EDGE_RIGHT:  Qt.SizeHorCursor,
    EDGE_TOP:    Qt.SizeVerCursor,
    EDGE_BOTTOM: Qt.SizeVerCursor,
    EDGE_TL:     Qt.SizeFDiagCursor,
    EDGE_TR:     Qt.SizeBDiagCursor,
    EDGE_BL:     Qt.SizeBDiagCursor,
    EDGE_BR:     Qt.SizeFDiagCursor,
}


def _mdl2_btn(char, tip="", obj_name="", size=28, font_size=13):
    btn = QPushButton(char)
    btn.setFont(QFont(MDL2, font_size))
    btn.setToolTip(tip)
    btn.setFixedSize(size, size)
    if obj_name:
        btn.setObjectName(obj_name)
    return btn


# ── 팝업 창 처리 (Google 로그인 등) ──────────────────────────────────────────
class CalendarPage(QWebEnginePage):
    def __init__(self, profile, parent=None):
        super().__init__(profile, parent)

    def createWindow(self, window_type):
        popup = QWebEngineView()
        popup.setWindowTitle("ASEA 캘린더 — 로그인")
        popup.setWindowFlags(Qt.Window)
        popup.setAttribute(Qt.WA_DeleteOnClose)
        popup.resize(500, 700)
        popup.show()
        return popup


# ── 리사이즈 핸들 위젯 ────────────────────────────────────────────────────────
class ResizeHandle(QWidget):
    """창 모서리/변에 올려놓는 투명 리사이즈 핸들"""

    def __init__(self, edge, parent):
        super().__init__(parent)
        self._edge = edge
        self._drag_start = None
        self._start_geo  = None
        self.setCursor(QCursor(EDGE_CURSORS.get(edge, Qt.ArrowCursor)))
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setStyleSheet("background:transparent;")

    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self._drag_start = e.globalPos()
            self._start_geo  = self.window().geometry()
        e.accept()

    def mouseMoveEvent(self, e):
        if not (e.buttons() & Qt.LeftButton and self._drag_start):
            return
        win = self.window()
        if win._is_fullscreen:
            return
        dx = e.globalPos().x() - self._drag_start.x()
        dy = e.globalPos().y() - self._drag_start.y()
        geo = QRect(self._start_geo)
        edge = self._edge

        if edge & EDGE_LEFT:
            new_left = geo.left() + dx
            if geo.right() - new_left >= MIN_W:
                geo.setLeft(new_left)
        if edge & EDGE_RIGHT:
            new_right = geo.right() + dx
            if new_right - geo.left() >= MIN_W:
                geo.setRight(new_right)
        if edge & EDGE_TOP:
            new_top = geo.top() + dy
            if geo.bottom() - new_top >= MIN_H:
                geo.setTop(new_top)
        if edge & EDGE_BOTTOM:
            new_bottom = geo.bottom() + dy
            if new_bottom - geo.top() >= MIN_H:
                geo.setBottom(new_bottom)

        win.setGeometry(geo)
        e.accept()

    def mouseReleaseEvent(self, e):
        self._drag_start = None
        self._start_geo  = None
        e.accept()


# ── 컨트롤 바 ────────────────────────────────────────────────────────────────
class ControlBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(40)
        self.setObjectName("controlBar")
        self.setStyleSheet("""
            #controlBar {
                background: rgba(24, 24, 28, 215);
                border-top-left-radius: 14px;
                border-top-right-radius: 14px;
            }
            QPushButton {
                background: transparent;
                color: rgba(200,200,210,1);
                border: none;
                border-radius: 6px;
                padding: 0;
            }
            QPushButton:hover { background: rgba(255,255,255,35); color: #fff; }
            QPushButton#btnClose:hover { background: rgba(232,17,35,200); color: #fff; }
            QPushButton[active="true"]  { color: #7eb8f7; }
            QPushButton[pinned="true"]  { color: #7eb8f7; }
            QSlider::groove:horizontal {
                height: 3px;
                background: rgba(255,255,255,50);
                border-radius: 2px;
            }
            QSlider::handle:horizontal {
                width: 11px; height: 11px;
                margin: -4px 0;
                background: #7eb8f7;
                border-radius: 6px;
            }
            QSlider::sub-page:horizontal {
                background: #7eb8f7;
                border-radius: 2px;
            }
            QLabel#titleLabel   { color: rgba(210,210,220,1); font-size: 12px; font-family: 'Segoe UI', sans-serif; letter-spacing: .3px; }
            QLabel#opacityLabel { color: rgba(160,165,175,1); font-size: 11px; min-width: 30px; font-family: 'Segoe UI', sans-serif; }
            QLabel#opacityIcon  { color: rgba(160,165,175,1); }
        """)

        self._drag_pos = None
        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 0, 8, 0)
        layout.setSpacing(2)

        title = QLabel("ASEA 캘린더")
        title.setObjectName("titleLabel")
        layout.addWidget(title)
        layout.addStretch()

        opac_icon = QLabel(IC_BRIGHT)
        opac_icon.setObjectName("opacityIcon")
        opac_icon.setFont(QFont(MDL2, 10))
        opac_icon.setToolTip("투명도")
        layout.addWidget(opac_icon)

        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(20, 100)
        self.slider.setValue(95)
        self.slider.setFixedWidth(76)
        self.slider.setToolTip("투명도")
        layout.addWidget(self.slider)

        self.opacity_label = QLabel("95%")
        self.opacity_label.setObjectName("opacityLabel")
        layout.addWidget(self.opacity_label)

        layout.addSpacing(4)

        self.btn_monitor = _mdl2_btn(IC_MONITOR, "모니터 선택")
        layout.addWidget(self.btn_monitor)

        self.btn_full = _mdl2_btn(IC_FULL, "전체화면 ON/OFF", "btnFull")
        self.btn_full.setProperty("active", "false")
        layout.addWidget(self.btn_full)

        self.btn_pin = _mdl2_btn(IC_PIN, "항상 위 고정", "btnPin")
        self.btn_pin.setProperty("pinned", "true")
        layout.addWidget(self.btn_pin)

        self.btn_refresh = _mdl2_btn(IC_REFRESH, "새로고침")
        layout.addWidget(self.btn_refresh)

        self.btn_min = _mdl2_btn(IC_MINIMIZE, "최소화")
        layout.addWidget(self.btn_min)

        self.btn_close = _mdl2_btn(IC_CLOSE, "닫기", "btnClose")
        layout.addWidget(self.btn_close)

    def _refresh_btn(self, btn, prop, val):
        btn.setProperty(prop, val)
        btn.style().unpolish(btn)
        btn.style().polish(btn)

    def set_pin(self, pinned):
        self.btn_pin.setText(IC_PIN if pinned else IC_UNPIN)
        self._refresh_btn(self.btn_pin, "pinned", "true" if pinned else "false")

    def set_fullscreen(self, active):
        self.btn_full.setText(IC_RESTORE if active else IC_FULL)
        self.btn_full.setToolTip("전체화면 해제" if active else "전체화면 ON/OFF")
        self._refresh_btn(self.btn_full, "active", "true" if active else "false")

    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self._drag_pos = e.globalPos() - self.window().frameGeometry().topLeft()

    def mouseDoubleClickEvent(self, e):
        if e.button() == Qt.LeftButton:
            self.window()._toggle_fullscreen()

    def mouseMoveEvent(self, e):
        if e.buttons() == Qt.LeftButton and self._drag_pos:
            win = self.window()
            if not win._is_fullscreen:
                new_pos = e.globalPos() - self._drag_pos
                # 자석 스냅 적용
                new_pos = win._snap_position(new_pos)
                win.move(new_pos)

    def mouseReleaseEvent(self, e):
        self._drag_pos = None


# ── 메인 윈도우 ──────────────────────────────────────────────────────────────
class CalendarWidget(QMainWindow):
    def __init__(self):
        super().__init__()
        self._pinned          = True
        self._is_fullscreen   = False
        self._saved_geometry  = None
        self._snapped_half    = None   # 'left' | 'right' | None
        self._target_screen   = QApplication.primaryScreen()
        self._setup_window()
        self._build_ui()
        self._connect_signals()

    def _setup_window(self):
        self.setWindowTitle("ASEA 캘린더")
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setMinimumSize(MIN_W, MIN_H)
        self.resize(430, 700)
        geo = self._target_screen.availableGeometry()
        self.move(geo.right() - self.width() - 20, geo.top() + 40)

    def _build_ui(self):
        root = QWidget()
        root.setObjectName("root")
        root.setStyleSheet("#root { background: rgba(255,255,255,0); border-radius: 14px; }")
        self.setCentralWidget(root)

        layout = QVBoxLayout(root)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.bar = ControlBar()
        layout.addWidget(self.bar)

        profile = QWebEngineProfile("asea_calendar_v2", self)
        profile.setPersistentCookiesPolicy(QWebEngineProfile.AllowPersistentCookies)
        profile.setHttpCacheType(QWebEngineProfile.DiskHttpCache)

        self.web = QWebEngineView()
        self._page = CalendarPage(profile, self.web)
        self.web.setPage(self._page)
        self.web.setUrl(QUrl(CALENDAR_URL))
        self.web.setFocusPolicy(Qt.StrongFocus)
        layout.addWidget(self.web)

        # 리사이즈 핸들 (4-모서리 + 4-변)
        self._handles = []
        for edge in [EDGE_TL, EDGE_TR, EDGE_BL, EDGE_BR,
                     EDGE_LEFT, EDGE_RIGHT, EDGE_TOP, EDGE_BOTTOM]:
            h = ResizeHandle(edge, self)
            self._handles.append(h)

        self._layout_handles()

    def _layout_handles(self):
        """리사이즈 핸들 위치/크기를 창 크기에 맞게 갱신"""
        W, H = self.width(), self.height()
        sz   = RESIZE_EDGE
        bar_h = self.bar.height() if hasattr(self, 'bar') else 40

        specs = {
            EDGE_TL:     (0,       0,       sz,       sz),
            EDGE_TR:     (W - sz,  0,       sz,       sz),
            EDGE_BL:     (0,       H - sz,  sz,       sz),
            EDGE_BR:     (W - sz,  H - sz,  sz,       sz),
            EDGE_LEFT:   (0,       sz,      sz,       H - 2*sz),
            EDGE_RIGHT:  (W - sz,  sz,      sz,       H - 2*sz),
            EDGE_TOP:    (sz,      0,       W - 2*sz, sz),
            EDGE_BOTTOM: (sz,      H - sz,  W - 2*sz, sz),
        }
        for h in self._handles:
            x, y, w, hh = specs[h._edge]
            h.setGeometry(x, y, w, hh)
            h.raise_()

    def resizeEvent(self, e):
        super().resizeEvent(e)
        self._layout_handles()

    def _connect_signals(self):
        self.bar.slider.valueChanged.connect(self._on_opacity)
        self.bar.btn_close.clicked.connect(self.close)
        self.bar.btn_refresh.clicked.connect(self.web.reload)
        self.bar.btn_min.clicked.connect(self.showMinimized)
        self.bar.btn_pin.clicked.connect(self._toggle_pin)
        self.bar.btn_full.clicked.connect(self._toggle_fullscreen)
        self.bar.btn_monitor.clicked.connect(self._show_monitor_menu)
        self._page.printRequested.connect(self._on_print)

    def _on_opacity(self, val):
        self.setWindowOpacity(val / 100)
        self.bar.opacity_label.setText(f"{val}%")

    def _toggle_pin(self):
        self._pinned = not self._pinned
        flags = Qt.FramelessWindowHint
        if self._pinned:
            flags |= Qt.WindowStaysOnTopHint
        self.bar.set_pin(self._pinned)
        self.setWindowFlags(flags)
        self.show()
        self.web.setFocus()

    # ── 자석 스냅 ─────────────────────────────────────────────────────────────
    def _snap_position(self, pos):
        """드래그 중 화면 끝 SNAP_MARGIN px 이내면 모서리에 달라붙음"""
        w, h = self.width(), self.height()
        nx, ny = pos.x(), pos.y()

        for screen in QApplication.screens():
            sg = screen.availableGeometry()
            # 좌
            if abs(nx - sg.left()) < SNAP_MARGIN:
                nx = sg.left()
            # 우
            if abs((nx + w) - sg.right()) < SNAP_MARGIN:
                nx = sg.right() - w
            # 상
            if abs(ny - sg.top()) < SNAP_MARGIN:
                ny = sg.top()
            # 하
            if abs((ny + h) - sg.bottom()) < SNAP_MARGIN:
                ny = sg.bottom() - h

        return QPoint(nx, ny)

    # ── 현재 모니터 감지 ──────────────────────────────────────────────────────
    def _current_screen(self):
        center = self.geometry().center()
        for screen in QApplication.screens():
            if screen.geometry().contains(center):
                return screen
        return self._target_screen

    # ── 전체화면 ──────────────────────────────────────────────────────────────
    def _toggle_fullscreen(self):
        if self._is_fullscreen:
            self._exit_fullscreen()
        else:
            self._enter_fullscreen(self._current_screen())

    def _enter_fullscreen(self, screen):
        if not self._is_fullscreen:
            self._saved_geometry = self.geometry()
        self._is_fullscreen = True
        self._snapped_half   = None
        self._hide_handles()
        self.setGeometry(screen.geometry())
        self.bar.set_fullscreen(True)

    def _exit_fullscreen(self):
        self._is_fullscreen = False
        self._show_handles()
        if self._saved_geometry:
            self.setGeometry(self._saved_geometry)
        self.bar.set_fullscreen(False)

    # ── 절반 스냅 ─────────────────────────────────────────────────────────────
    def _snap_half(self, side):
        """현재 모니터의 좌/우/상/하 절반에 창을 붙임"""
        screen = self._current_screen()
        geo    = screen.availableGeometry()
        half_w = geo.width() // 2
        half_h = geo.height() // 2

        if self._snapped_half == side:
            # 같은 방향 재입력 → 이전 크기 복원
            self._snapped_half = None
            if self._saved_geometry:
                self.setGeometry(self._saved_geometry)
            return

        if not self._is_fullscreen and self._snapped_half is None:
            self._saved_geometry = self.geometry()

        self._is_fullscreen = False
        self._snapped_half  = side
        self._show_handles()
        self.bar.set_fullscreen(False)

        if   side == 'left':
            self.setGeometry(geo.left(),          geo.top(),          half_w, geo.height())
        elif side == 'right':
            self.setGeometry(geo.left() + half_w, geo.top(),          half_w, geo.height())
        elif side == 'top':
            self.setGeometry(geo.left(),          geo.top(),          geo.width(), half_h)
        elif side == 'bottom':
            self.setGeometry(geo.left(),          geo.top() + half_h, geo.width(), half_h)

    def _hide_handles(self):
        for h in self._handles:
            h.hide()

    def _show_handles(self):
        for h in self._handles:
            h.show()

    # ── 모니터 선택 메뉴 ──────────────────────────────────────────────────────
    def _show_monitor_menu(self):
        screens = QApplication.screens()
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background: rgba(28,28,32,235);
                color: #ddd;
                border: 1px solid rgba(255,255,255,25);
                border-radius: 10px;
                padding: 5px;
                font-family: 'Segoe UI', sans-serif;
                font-size: 13px;
            }
            QMenu::item { padding: 7px 18px; border-radius: 6px; }
            QMenu::item:selected { background: rgba(126,184,247,110); color: #fff; }
            QMenu::separator { height: 1px; background: rgba(255,255,255,18); margin: 4px 8px; }
            QMenu::item:disabled { color: rgba(180,180,180,.45); }
        """)

        for i, screen in enumerate(screens):
            g = screen.geometry()
            is_cur = (screen == self._current_screen())
            label = f"  모니터 {i+1}  ·  {g.width()}×{g.height()}" + ("  ✓" if is_cur else "")
            sub = QMenu(label, menu)
            sub.setStyleSheet(menu.styleSheet())

            act_move = QAction("  이 모니터로 이동", sub)
            act_move.setData(("move", i))
            sub.addAction(act_move)

            act_fs = QAction("  이 모니터에서 전체화면", sub)
            act_fs.setData(("full", i))
            sub.addAction(act_fs)

            act_l = QAction("  이 모니터 왼쪽 절반", sub)
            act_l.setData(("half_left", i))
            sub.addAction(act_l)

            act_r = QAction("  이 모니터 오른쪽 절반", sub)
            act_r.setData(("half_right", i))
            sub.addAction(act_r)

            menu.addMenu(sub)

        menu.addSeparator()
        label_fs = "  전체화면 해제" if self._is_fullscreen else "  현재 모니터 전체화면"
        act_exit = QAction(label_fs, menu)
        act_exit.setData(("toggle_full", -1))
        menu.addAction(act_exit)

        chosen = menu.exec_(self.bar.btn_monitor.mapToGlobal(
            self.bar.btn_monitor.rect().bottomLeft()
        ))
        if not chosen:
            return

        cmd, idx = chosen.data()
        if cmd == "toggle_full":
            self._toggle_fullscreen()
        elif cmd in ("move", "full", "half_left", "half_right"):
            self._target_screen = QApplication.screens()[idx]
            if cmd == "move":
                if self._is_fullscreen:
                    self._enter_fullscreen(self._target_screen)
                else:
                    self._move_to_screen(self._target_screen)
            elif cmd == "full":
                self._enter_fullscreen(self._target_screen)
            elif cmd == "half_left":
                self._exit_fullscreen_silent()
                self._move_to_screen(self._target_screen)
                self._snap_half('left')
            elif cmd == "half_right":
                self._exit_fullscreen_silent()
                self._move_to_screen(self._target_screen)
                self._snap_half('right')

    def _exit_fullscreen_silent(self):
        """전체화면을 UI 업데이트 없이 내부 상태만 해제"""
        self._is_fullscreen = False
        self._show_handles()
        self.bar.set_fullscreen(False)

    def _move_to_screen(self, screen):
        geo = screen.availableGeometry()
        self.move(geo.right() - self.width() - 20, geo.top() + 40)

    # ── 인쇄 ──────────────────────────────────────────────────────────────────
    def _on_print(self):
        printer = QPrinter()
        dlg = QPrintDialog(printer, self)
        if dlg.exec_() == QPrintDialog.Accepted:
            self._page.print(printer, lambda ok: None)

    # ── 키보드 단축키 ─────────────────────────────────────────────────────────
    def keyPressEvent(self, e):
        key  = e.key()
        mods = e.modifiers()

        # ESC → 전체화면 / 절반스냅(상하좌우) 해제
        if key == Qt.Key_Escape:
            if self._is_fullscreen:
                self._exit_fullscreen()
            elif self._snapped_half:
                self._snapped_half = None
                self._show_handles()
                if self._saved_geometry:
                    self.setGeometry(self._saved_geometry)
            return

        # Win + 방향키  (Windows 탐색기 스타일)
        if mods & Qt.MetaModifier:
            if key == Qt.Key_Up:
                # 전체화면 → 복원 / 상단절반 → 전체화면 / 그 외 → 상단절반
                if self._is_fullscreen:
                    self._exit_fullscreen()
                elif self._snapped_half == 'top':
                    self._exit_fullscreen_silent()
                    self._snapped_half = None
                    self._enter_fullscreen(self._current_screen())
                elif self._snapped_half == 'bottom':
                    self._snapped_half = None
                    self._exit_fullscreen_silent()
                    if self._saved_geometry:
                        self.setGeometry(self._saved_geometry)
                else:
                    if self._is_fullscreen:
                        self._exit_fullscreen_silent()
                    self._snap_half('top')
                return
            if key == Qt.Key_Down:
                # 전체화면 → 복원 / 상단절반 → 하단절반 / 하단절반 → 최소화 / 일반 → 하단절반
                if self._is_fullscreen:
                    self._exit_fullscreen()
                elif self._snapped_half == 'top':
                    self._exit_fullscreen_silent()
                    self._snapped_half = None
                    self._snap_half('bottom')
                elif self._snapped_half == 'bottom':
                    self._snapped_half = None
                    self._show_handles()
                    if self._saved_geometry:
                        self.setGeometry(self._saved_geometry)
                    else:
                        self.showMinimized()
                elif self._snapped_half in ('left', 'right'):
                    self._snapped_half = None
                    self._show_handles()
                    if self._saved_geometry:
                        self.setGeometry(self._saved_geometry)
                else:
                    self._snap_half('bottom')
                return
            if key == Qt.Key_Left:
                if self._is_fullscreen:
                    self._exit_fullscreen_silent()
                self._snap_half('left')
                return
            if key == Qt.Key_Right:
                if self._is_fullscreen:
                    self._exit_fullscreen_silent()
                self._snap_half('right')
                return

        super().keyPressEvent(e)

    def mousePressEvent(self, e):
        super().mousePressEvent(e)
        self.activateWindow()
        self.web.setFocus(Qt.MouseFocusReason)


# ── 진입점 ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setApplicationName("ASEA Calendar Widget")
    win = CalendarWidget()
    win.show()
    sys.exit(app.exec_())
