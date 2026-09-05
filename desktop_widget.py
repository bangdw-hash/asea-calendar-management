"""
ASEA 캘린더 데스크탑 위젯
Windows 11 투명 오버레이 / 항상 위 표시

설치:  pip install PyQt5 PyQtWebEngine
실행:  python desktop_widget.py  (또는 실행.bat 더블클릭)
"""

import sys, os, subprocess

# python.exe → pythonw.exe 자동 전환 (CMD 창 제거)
if os.name == "nt" and sys.executable.lower().endswith("python.exe"):
    pythonw = sys.executable[:-10] + "pythonw.exe"
    if os.path.exists(pythonw):
        subprocess.Popen([pythonw] + sys.argv)
        sys.exit(0)

os.environ.setdefault("QT_AUTO_SCREEN_SCALE_FACTOR", "1")

from PyQt5.QtCore    import Qt, QUrl, QRect
from PyQt5.QtGui     import QFont
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QSlider, QLabel, QSizeGrip, QMenu, QAction
)
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineProfile, QWebEnginePage
from PyQt5.QtPrintSupport import QPrinter, QPrintDialog

CALENDAR_URL = "https://bangdw-hash.github.io/asea-calendar-management/schedule.html"

# Segoe MDL2 Assets 코드포인트 (Windows 10/11 시스템 폰트)
MDL2 = "Segoe MDL2 Assets"
IC_BRIGHT   = chr(0xE706)  # Brightness
IC_MONITOR  = chr(0xE7F4)  # TVMonitor
IC_FULL     = chr(0xE740)  # FullScreen
IC_RESTORE  = chr(0xE73F)  # BackToWindow
IC_PIN      = chr(0xE718)  # Pin
IC_UNPIN    = chr(0xE77A)  # UnPin
IC_REFRESH  = chr(0xE72C)  # Refresh
IC_MINIMIZE = chr(0xE921)  # ChromeMinimize
IC_CLOSE    = chr(0xE8BB)  # ChromeClose


def _mdl2_btn(char, tip="", obj_name="", size=28, font_size=13):
    """Segoe MDL2 Assets 아이콘 버튼 생성"""
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
            QLabel#titleLabel { color: rgba(210,210,220,1); font-size: 12px; font-family: 'Segoe UI', sans-serif; letter-spacing: .3px; }
            QLabel#opacityLabel { color: rgba(160,165,175,1); font-size: 11px; min-width: 30px; font-family: 'Segoe UI', sans-serif; }
            QLabel#opacityIcon { color: rgba(160,165,175,1); }
        """)

        self._drag_pos = None
        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 0, 8, 0)
        layout.setSpacing(2)

        # 타이틀
        title = QLabel("ASEA 캘린더")
        title.setObjectName("titleLabel")
        layout.addWidget(title)
        layout.addStretch()

        # 투명도 아이콘 + 슬라이더
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

        # 모니터 선택
        self.btn_monitor = _mdl2_btn(IC_MONITOR, "모니터 선택")
        layout.addWidget(self.btn_monitor)

        # 전체화면 토글
        self.btn_full = _mdl2_btn(IC_FULL, "전체화면 ON/OFF", "btnFull")
        self.btn_full.setProperty("active", "false")
        layout.addWidget(self.btn_full)

        # 항상 위 핀
        self.btn_pin = _mdl2_btn(IC_PIN, "항상 위 고정", "btnPin")
        self.btn_pin.setProperty("pinned", "true")
        layout.addWidget(self.btn_pin)

        # 새로고침
        self.btn_refresh = _mdl2_btn(IC_REFRESH, "새로고침")
        layout.addWidget(self.btn_refresh)

        # 최소화
        self.btn_min = _mdl2_btn(IC_MINIMIZE, "최소화")
        layout.addWidget(self.btn_min)

        # 닫기
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

    def mouseMoveEvent(self, e):
        if e.buttons() == Qt.LeftButton and self._drag_pos:
            if not self.window()._is_fullscreen:
                self.window().move(e.globalPos() - self._drag_pos)

    def mouseReleaseEvent(self, e):
        self._drag_pos = None


# ── 메인 윈도우 ──────────────────────────────────────────────────────────────
class CalendarWidget(QMainWindow):
    def __init__(self):
        super().__init__()
        self._pinned = True
        self._is_fullscreen = False
        self._saved_geometry = None
        self._target_screen = QApplication.primaryScreen()
        self._setup_window()
        self._build_ui()
        self._connect_signals()

    def _setup_window(self):
        self.setWindowTitle("ASEA 캘린더")
        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setMinimumSize(320, 460)
        self.resize(430, 700)
        geo = self._target_screen.availableGeometry()
        self.move(geo.right() - self.width() - 20, geo.top() + 40)

    def _build_ui(self):
        root = QWidget()
        root.setObjectName("root")
        root.setStyleSheet("""
            #root {
                background: rgba(255,255,255,0);
                border-radius: 14px;
            }
        """)
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

        # 크기 조절 핸들
        self._grip_row = QHBoxLayout()
        self._grip_row.setContentsMargins(0, 0, 2, 2)
        self._grip_row.addStretch()
        self._grip = QSizeGrip(self)
        self._grip.setFixedSize(16, 16)
        self._grip_row.addWidget(self._grip)
        layout.addLayout(self._grip_row)

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
            is_cur = (screen == self._target_screen)
            label = f"  모니터 {i+1}  ·  {g.width()}×{g.height()}" + ("  ✓" if is_cur else "")

            sub = QMenu(label, menu)
            sub.setStyleSheet(menu.styleSheet())

            act_move = QAction(f"  이 모니터로 이동", sub)
            act_move.setData(("move", i))
            sub.addAction(act_move)

            act_fs = QAction(f"  이 모니터에서 전체화면", sub)
            act_fs.setData(("full", i))
            sub.addAction(act_fs)

            menu.addMenu(sub)

        menu.addSeparator()

        act_exit = QAction(f"  {"전체화면 해제" if self._is_fullscreen else "현재 위치에서 전체화면"}", menu)
        act_exit.setData(("toggle_full", -1))
        menu.addAction(act_exit)

        chosen = menu.exec_(self.bar.btn_monitor.mapToGlobal(
            self.bar.btn_monitor.rect().bottomLeft()
        ))
        if chosen is None:
            return

        data = chosen.data()
        if not data:
            return
        cmd, idx = data

        if cmd == "toggle_full":
            self._toggle_fullscreen()
        elif cmd == "move":
            self._target_screen = QApplication.screens()[idx]
            if self._is_fullscreen:
                self._enter_fullscreen(self._target_screen)
            else:
                self._move_to_screen(self._target_screen)
        elif cmd == "full":
            self._target_screen = QApplication.screens()[idx]
            self._enter_fullscreen(self._target_screen)

    def _move_to_screen(self, screen):
        geo = screen.availableGeometry()
        self.move(geo.right() - self.width() - 20, geo.top() + 40)

    # ── 전체화면 ──────────────────────────────────────────────────────────────
    def _toggle_fullscreen(self):
        if self._is_fullscreen:
            self._exit_fullscreen()
        else:
            self._enter_fullscreen(self._target_screen)

    def _enter_fullscreen(self, screen):
        if not self._is_fullscreen:
            self._saved_geometry = self.geometry()
        self._is_fullscreen = True
        self._grip.hide()
        self.setGeometry(screen.geometry())
        self.bar.set_fullscreen(True)

    def _exit_fullscreen(self):
        self._is_fullscreen = False
        self._grip.show()
        if self._saved_geometry:
            self.setGeometry(self._saved_geometry)
        self.bar.set_fullscreen(False)

    # ── 인쇄 ──────────────────────────────────────────────────────────────────
    def _on_print(self):
        printer = QPrinter()
        dlg = QPrintDialog(printer, self)
        if dlg.exec_() == QPrintDialog.Accepted:
            self._page.print(printer, lambda ok: None)

    def keyPressEvent(self, e):
        if e.key() == Qt.Key_Escape and self._is_fullscreen:
            self._exit_fullscreen()
        super().keyPressEvent(e)

    # 창 클릭 시 웹뷰 포커스 보장
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
