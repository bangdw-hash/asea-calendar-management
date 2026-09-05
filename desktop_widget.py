"""
ASEA 캘린더 데스크탑 위젯
Windows 11 투명 오버레이 / 항상 위 표시

설치:
    pip install PyQt5 PyQtWebEngine

실행:
    pythonw desktop_widget.py   (CMD 창 없음)
    python   desktop_widget.py  (CMD 창 있음 — 자동 전환)
"""

import sys, os, subprocess

# python.exe로 실행된 경우 pythonw.exe(무창)로 자동 재실행
if os.name == "nt" and sys.executable.lower().endswith("python.exe"):
    pythonw = sys.executable[:-10] + "pythonw.exe"
    if os.path.exists(pythonw):
        subprocess.Popen([pythonw] + sys.argv)
        sys.exit(0)

from PyQt5.QtCore import Qt, QUrl, QRect
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QSlider, QLabel, QSizeGrip, QMenu, QAction
)
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineProfile, QWebEnginePage

CALENDAR_URL = "https://bangdw-hash.github.io/asea-calendar-management/schedule.html"


# ── 컨트롤 바 ────────────────────────────────────────────────────────────────
class ControlBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(38)
        self.setObjectName("controlBar")
        self.setStyleSheet("""
            #controlBar {
                background: rgba(30, 30, 30, 210);
                border-top-left-radius: 14px;
                border-top-right-radius: 14px;
            }
            QPushButton {
                background: transparent;
                color: #ccc;
                border: none;
                font-size: 13px;
                padding: 2px 6px;
                border-radius: 6px;
            }
            QPushButton:hover { background: rgba(255,255,255,40); color: #fff; }
            QPushButton#btnClose:hover { background: rgba(255,60,60,180); color: #fff; }
            QPushButton#btnFullscreen[active="true"] { color: #7eb8f7; }
            QPushButton#btnPin[pinned="true"] { color: #7eb8f7; }
            QLabel#titleLabel { color: #bbb; font-size: 12px; font-family: 'Segoe UI', sans-serif; }
            QSlider::groove:horizontal { height: 4px; background: rgba(255,255,255,60); border-radius: 2px; }
            QSlider::handle:horizontal { width: 12px; height: 12px; margin: -4px 0; background: #7eb8f7; border-radius: 6px; }
            QSlider::sub-page:horizontal { background: #7eb8f7; border-radius: 2px; }
            QLabel#opacityLabel { color: #aaa; font-size: 11px; min-width: 28px; }
        """)

        self._drag_pos = None
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 0, 8, 0)
        layout.setSpacing(3)

        title = QLabel("📅 ASEA 캘린더")
        title.setObjectName("titleLabel")
        layout.addWidget(title)
        layout.addStretch()

        # 투명도
        opaque_icon = QLabel("◑")
        opaque_icon.setStyleSheet("color:#888;font-size:12px;")
        layout.addWidget(opaque_icon)

        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(20, 100)
        self.slider.setValue(95)
        self.slider.setFixedWidth(72)
        self.slider.setToolTip("투명도")
        layout.addWidget(self.slider)

        self.opacity_label = QLabel("95%")
        self.opacity_label.setObjectName("opacityLabel")
        layout.addWidget(self.opacity_label)

        layout.addSpacing(4)

        # 모니터 선택 버튼
        self.btn_monitor = QPushButton("🖥")
        self.btn_monitor.setToolTip("모니터 선택")
        self.btn_monitor.setFixedSize(28, 28)
        layout.addWidget(self.btn_monitor)

        # 전체화면 토글
        self.btn_fullscreen = QPushButton("⛶")
        self.btn_fullscreen.setObjectName("btnFullscreen")
        self.btn_fullscreen.setToolTip("전체화면 ON/OFF")
        self.btn_fullscreen.setFixedSize(28, 28)
        self.btn_fullscreen.setProperty("active", "false")
        layout.addWidget(self.btn_fullscreen)

        # 항상 위
        self.btn_pin = QPushButton("📌")
        self.btn_pin.setObjectName("btnPin")
        self.btn_pin.setToolTip("항상 위 고정 ON/OFF")
        self.btn_pin.setFixedSize(28, 28)
        self.btn_pin.setProperty("pinned", "true")
        layout.addWidget(self.btn_pin)

        # 새로고침
        self.btn_refresh = QPushButton("↺")
        self.btn_refresh.setToolTip("새로고침")
        self.btn_refresh.setFixedSize(28, 28)
        layout.addWidget(self.btn_refresh)

        # 최소화
        self.btn_min = QPushButton("−")
        self.btn_min.setToolTip("최소화")
        self.btn_min.setFixedSize(28, 28)
        layout.addWidget(self.btn_min)

        # 닫기
        self.btn_close = QPushButton("✕")
        self.btn_close.setObjectName("btnClose")
        self.btn_close.setToolTip("닫기")
        self.btn_close.setFixedSize(28, 28)
        layout.addWidget(self.btn_close)

    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self._drag_pos = e.globalPos() - self.window().frameGeometry().topLeft()

    def mouseMoveEvent(self, e):
        if e.buttons() == Qt.LeftButton and self._drag_pos:
            # 전체화면 상태일 때는 드래그 금지
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
        self._saved_geometry = None          # 전체화면 전 크기/위치 저장
        self._target_screen = QApplication.primaryScreen()
        self._setup_window()
        self._build_ui()
        self._connect_signals()

    def _setup_window(self):
        self.setWindowTitle("ASEA 캘린더")
        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.Tool
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setMinimumSize(300, 400)
        self.resize(420, 680)

        # 주 모니터 오른쪽 상단에 배치
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

        profile = QWebEngineProfile("asea_calendar", self)
        profile.setPersistentCookiesPolicy(QWebEngineProfile.AllowPersistentCookies)
        profile.setHttpCacheType(QWebEngineProfile.DiskHttpCache)

        self.web = QWebEngineView()
        page = QWebEnginePage(profile, self.web)
        self.web.setPage(page)
        self.web.setUrl(QUrl(CALENDAR_URL))

        layout.addWidget(self.web)

        # 크기 조절 핸들 (수동 리사이즈용)
        self._grip_row = QHBoxLayout()
        self._grip_row.setContentsMargins(0, 0, 2, 2)
        self._grip_row.addStretch()
        self._grip = QSizeGrip(self)
        self._grip.setFixedSize(16, 16)
        self._grip.setToolTip("드래그하여 크기 조절")
        self._grip_row.addWidget(self._grip)
        layout.addLayout(self._grip_row)

    def _connect_signals(self):
        self.bar.slider.valueChanged.connect(self._on_opacity)
        self.bar.btn_close.clicked.connect(self.close)
        self.bar.btn_refresh.clicked.connect(self.web.reload)
        self.bar.btn_min.clicked.connect(self.showMinimized)
        self.bar.btn_pin.clicked.connect(self._toggle_pin)
        self.bar.btn_fullscreen.clicked.connect(self._toggle_fullscreen)
        self.bar.btn_monitor.clicked.connect(self._show_monitor_menu)

    def _on_opacity(self, val):
        self.setWindowOpacity(val / 100)
        self.bar.opacity_label.setText(f"{val}%")

    def _toggle_pin(self):
        self._pinned = not self._pinned
        flags = Qt.FramelessWindowHint | Qt.Tool
        if self._pinned:
            flags |= Qt.WindowStaysOnTopHint
        self.bar.btn_pin.setProperty("pinned", "true" if self._pinned else "false")
        self.bar.btn_pin.style().unpolish(self.bar.btn_pin)
        self.bar.btn_pin.style().polish(self.bar.btn_pin)
        self.setWindowFlags(flags)
        self.show()

    # ── 모니터 선택 메뉴 ──────────────────────────────────────────────────────
    def _show_monitor_menu(self):
        screens = QApplication.screens()
        if len(screens) == 1:
            # 모니터가 하나뿐이면 바로 그 모니터로
            self._target_screen = screens[0]
            self._apply_to_screen(screens[0])
            return

        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background: rgba(30,30,30,230);
                color: #ddd;
                border: 1px solid rgba(255,255,255,30);
                border-radius: 8px;
                padding: 4px;
                font-family: 'Segoe UI', sans-serif;
                font-size: 13px;
            }
            QMenu::item { padding: 6px 16px; border-radius: 5px; }
            QMenu::item:selected { background: rgba(126,184,247,120); color: #fff; }
        """)

        for i, screen in enumerate(screens):
            geo = screen.geometry()
            label = (
                f"🖥  모니터 {i+1}  —  {geo.width()}×{geo.height()}"
                f"  ({'현재' if screen == self._target_screen else screen.name()})"
            )
            action = QAction(label, self)
            action.setData(i)
            menu.addAction(action)

        menu.addSeparator()
        action_fullscreen = QAction("⛶  선택한 모니터에서 전체화면", self)
        action_fullscreen.setData("fullscreen")
        menu.addAction(action_fullscreen)

        chosen = menu.exec_(self.bar.btn_monitor.mapToGlobal(
            self.bar.btn_monitor.rect().bottomLeft()
        ))
        if chosen is None:
            return

        data = chosen.data()
        if data == "fullscreen":
            self._apply_to_screen(self._target_screen, fullscreen=True)
        elif isinstance(data, int):
            self._target_screen = screens[data]
            if self._is_fullscreen:
                self._apply_to_screen(self._target_screen, fullscreen=True)
            else:
                self._move_to_screen(self._target_screen)

    def _move_to_screen(self, screen):
        """선택 모니터 오른쪽 상단으로 이동 (크기 유지)"""
        geo = screen.availableGeometry()
        self.move(geo.right() - self.width() - 20, geo.top() + 40)

    def _apply_to_screen(self, screen, fullscreen=None):
        """선택 모니터에 전체화면 또는 이동"""
        if fullscreen is None:
            fullscreen = self._is_fullscreen
        if fullscreen:
            self._enter_fullscreen(screen)
        else:
            self._move_to_screen(screen)

    # ── 전체화면 토글 ─────────────────────────────────────────────────────────
    def _toggle_fullscreen(self):
        if self._is_fullscreen:
            self._exit_fullscreen()
        else:
            self._enter_fullscreen(self._target_screen)

    def _enter_fullscreen(self, screen):
        self._saved_geometry = self.geometry()
        self._is_fullscreen = True
        self._grip.hide()

        geo = screen.geometry()           # 전체 면적 (작업표시줄 포함)
        self.setGeometry(geo)

        self.bar.btn_fullscreen.setProperty("active", "true")
        self.bar.btn_fullscreen.style().unpolish(self.bar.btn_fullscreen)
        self.bar.btn_fullscreen.style().polish(self.bar.btn_fullscreen)
        self.bar.btn_fullscreen.setToolTip("전체화면 해제")

    def _exit_fullscreen(self):
        self._is_fullscreen = False
        self._grip.show()
        if self._saved_geometry:
            self.setGeometry(self._saved_geometry)

        self.bar.btn_fullscreen.setProperty("active", "false")
        self.bar.btn_fullscreen.style().unpolish(self.bar.btn_fullscreen)
        self.bar.btn_fullscreen.style().polish(self.bar.btn_fullscreen)
        self.bar.btn_fullscreen.setToolTip("전체화면 ON/OFF")

    def keyPressEvent(self, e):
        if e.key() == Qt.Key_Escape and self._is_fullscreen:
            self._exit_fullscreen()
        super().keyPressEvent(e)


# ── 진입점 ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    os.environ.setdefault("QT_AUTO_SCREEN_SCALE_FACTOR", "1")

    app = QApplication(sys.argv)
    app.setApplicationName("ASEA Calendar Widget")

    win = CalendarWidget()
    win.show()
    sys.exit(app.exec_())
