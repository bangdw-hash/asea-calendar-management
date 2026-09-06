"""
ASEA 업무 캘린더 — 데스크탑 오버레이 v2
=========================================
모드 전환: Ctrl+Alt+C  또는  우하단 🖊 버튼

  [바탕화면 모드]  반투명·클릭 투과, 뒤 레이어, 조회 전용
  [수정 모드]      최상위, 완전 상호작용 (Google 로그인 + 편집)

필요 패키지:
    pip install PyQt6 PyQt6-WebEngine keyboard

Google OAuth 쓰기 기능을 위해 Google Cloud Console에서
'http://localhost:8765' 를 승인된 JavaScript 원본에 추가하세요.
"""

import sys
import os
import threading
import http.server
import socketserver
import ctypes
import ctypes.wintypes
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QSlider, QPushButton, QLabel, QSystemTrayIcon, QMenu, QSizeGrip,
)
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtCore import Qt, QUrl, QPoint, QSize, pyqtSignal, QObject
from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor, QAction, QFont, QKeySequence, QShortcut

# ── 경로 설정 ────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_FILE  = 'schedule.html'
HTTP_PORT  = 8765
HTTP_URL   = f'http://localhost:{HTTP_PORT}/{HTML_FILE}'

# ── Windows API (클릭 투과) ─────────────────────────────────────────────
_IS_WINDOWS = sys.platform == 'win32'
GWL_EXSTYLE      = -20
WS_EX_TRANSPARENT = 0x00000020
WS_EX_LAYERED     = 0x00080000

def _set_click_through(hwnd: int, enable: bool):
    if not _IS_WINDOWS:
        return
    style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    if enable:
        style |= WS_EX_TRANSPARENT | WS_EX_LAYERED
    else:
        style &= ~WS_EX_TRANSPARENT
        style |= WS_EX_LAYERED           # LAYERED는 투명도에 필요해서 유지
    ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)


# ── 로컬 HTTP 서버 ───────────────────────────────────────────────────────
class _SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass   # 콘솔 로그 숨기기

def _start_http_server():
    """백그라운드 스레드에서 schedule.html 디렉터리를 HTTP 서빙"""
    os.chdir(SCRIPT_DIR)
    with socketserver.TCPServer(('', HTTP_PORT), _SilentHandler) as httpd:
        httpd.serve_forever()

_server_thread = threading.Thread(target=_start_http_server, daemon=True)
_server_thread.start()


# ── 전역 단축키 신호 ────────────────────────────────────────────────────
class _HotkeySignal(QObject):
    triggered = pyqtSignal()

_hotkey_signal = _HotkeySignal()

def _register_global_hotkey():
    try:
        import keyboard
        keyboard.add_hotkey('ctrl+alt+c', lambda: _hotkey_signal.triggered.emit(),
                            suppress=False)
    except ImportError:
        pass   # keyboard 패키지 없으면 Qt 내부 단축키만 사용

_hk_thread = threading.Thread(target=_register_global_hotkey, daemon=True)
_hk_thread.start()


# ── 이모지 아이콘 생성 ────────────────────────────────────────────────────
def _emoji_icon(emoji: str, size: int = 64) -> QIcon:
    px = QPixmap(size, size)
    px.fill(Qt.GlobalColor.transparent)
    p = QPainter(px)
    f = QFont()
    f.setPixelSize(int(size * 0.72))
    p.setFont(f)
    p.drawText(px.rect(), Qt.AlignmentFlag.AlignCenter, emoji)
    p.end()
    return QIcon(px)


# ── 플로팅 토글 버튼 (항상 표시) ────────────────────────────────────────
class ToggleBtn(QWidget):
    """화면 우하단에 항상 표시되는 모드 전환 버튼"""

    def __init__(self, on_click):
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool,
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(48, 48)

        self._btn = QPushButton('🖊', self)
        self._btn.setFixedSize(48, 48)
        self._btn.setToolTip('캘린더 편집 모드 (Ctrl+Alt+C)')
        self._btn.clicked.connect(on_click)
        self._btn.setStyleSheet("""
            QPushButton {
                background: rgba(26,115,232,0.82);
                color: #fff;
                border-radius: 24px;
                font-size: 20px;
                border: none;
            }
            QPushButton:hover  { background: rgba(26,115,232,1); }
            QPushButton:pressed{ background: rgba(15,80,180,1); }
        """)

        self._place_corner()

    def _place_corner(self):
        screen = QApplication.primaryScreen().availableGeometry()
        self.move(screen.right() - 60, screen.bottom() - 60)

    def set_icon(self, edit_mode: bool):
        self._btn.setText('✕  닫기' if edit_mode else '🖊')
        self._btn.setFixedWidth(90 if edit_mode else 48)
        self.setFixedWidth(90 if edit_mode else 48)
        self._place_corner()


# ── 타이틀바 ─────────────────────────────────────────────────────────────
class TitleBar(QWidget):
    def __init__(self, parent: 'CalendarOverlay'):
        super().__init__(parent)
        self._win = parent
        self._drag_pos: QPoint | None = None
        self.setFixedHeight(40)
        self.setObjectName('titlebar')

        ly = QHBoxLayout(self)
        ly.setContentsMargins(14, 0, 8, 0)
        ly.setSpacing(6)

        lbl = QLabel('📅  아세아 업무 캘린더')
        lbl.setObjectName('titleLabel')
        ly.addWidget(lbl)
        ly.addStretch()

        # 모드 표시 배지
        self.mode_badge = QLabel('[ 수정 모드 ]')
        self.mode_badge.setObjectName('modeBadge')
        ly.addWidget(self.mode_badge)
        ly.addSpacing(8)

        # 투명도 슬라이더
        ly.addWidget(QLabel('투명도'))
        self.op_slider = QSlider(Qt.Orientation.Horizontal)
        self.op_slider.setRange(20, 100)
        self.op_slider.setValue(95)
        self.op_slider.setFixedWidth(80)
        self.op_slider.valueChanged.connect(parent.set_opacity)
        ly.addWidget(self.op_slider)
        ly.addSpacing(4)

        # 바탕화면 모드로 전환
        self.bg_btn = QPushButton('🖥 바탕화면')
        self.bg_btn.setObjectName('ctrlBtn')
        self.bg_btn.setFixedHeight(28)
        self.bg_btn.setToolTip('바탕화면 모드로 전환 (Ctrl+Alt+C)')
        self.bg_btn.clicked.connect(parent.toggle_mode)
        ly.addWidget(self.bg_btn)

        # 최소화
        min_btn = QPushButton('—')
        min_btn.setObjectName('ctrlBtn')
        min_btn.setFixedSize(30, 30)
        min_btn.clicked.connect(parent.showMinimized)
        ly.addWidget(min_btn)

        # 닫기 (트레이로)
        close_btn = QPushButton('✕')
        close_btn.setObjectName('closeBtn')
        close_btn.setFixedSize(30, 30)
        close_btn.clicked.connect(parent.hide_to_tray)
        ly.addWidget(close_btn)

    def mousePressEvent(self, ev):
        if ev.button() == Qt.MouseButton.LeftButton:
            self._drag_pos = ev.globalPosition().toPoint() - self._win.frameGeometry().topLeft()

    def mouseMoveEvent(self, ev):
        if ev.buttons() == Qt.MouseButton.LeftButton and self._drag_pos:
            self._win.move(ev.globalPosition().toPoint() - self._drag_pos)

    def mouseReleaseEvent(self, _ev):
        self._drag_pos = None

    def mouseDoubleClickEvent(self, _ev):
        if self._win.isMaximized():
            self._win.showNormal()
        else:
            self._win.showMaximized()


# ── 메인 오버레이 창 ─────────────────────────────────────────────────────
class CalendarOverlay(QMainWindow):
    MODE_BG   = 'bg'    # 바탕화면 모드
    MODE_EDIT = 'edit'  # 수정 모드

    def __init__(self):
        super().__init__()
        self._mode = None

        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool,
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setMinimumSize(QSize(600, 400))

        # ── 레이아웃 ─────────────────────────────────────────────────
        root = QWidget()
        root.setObjectName('root')
        rl = QVBoxLayout(root)
        rl.setContentsMargins(0, 0, 0, 0)
        rl.setSpacing(0)

        self.titlebar = TitleBar(self)
        rl.addWidget(self.titlebar)

        self.webview = QWebEngineView()
        s = self.webview.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        self.webview.load(QUrl(HTTP_URL))
        rl.addWidget(self.webview, stretch=1)

        grip_row = QWidget()
        grip_row.setObjectName('gripRow')
        grip_row.setFixedHeight(14)
        gl = QHBoxLayout(grip_row)
        gl.setContentsMargins(0, 0, 4, 2)
        gl.addStretch()
        grip = QSizeGrip(self)
        grip.setFixedSize(14, 14)
        gl.addWidget(grip)
        rl.addWidget(grip_row)

        self.setCentralWidget(root)

        # ── 스타일 ────────────────────────────────────────────────────
        self.setStyleSheet("""
            #root {
                background: rgba(255,255,255,0.94);
                border-radius: 14px;
                border: 1.5px solid rgba(0,0,0,0.12);
            }
            #titlebar {
                background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
                    stop:0 #1a73e8, stop:1 #1557b0);
                border-radius: 12px 12px 0 0;
            }
            #titleLabel {
                color:#fff; font-weight:700; font-size:13px;
            }
            #modeBadge {
                color: rgba(255,255,200,0.95);
                font-size:11px; font-weight:600;
                background:rgba(0,0,0,0.2);
                border-radius:4px; padding:2px 7px;
            }
            #ctrlBtn {
                background:rgba(255,255,255,0.15); color:#fff;
                border:none; border-radius:7px; font-size:12px;
                padding: 0 8px;
            }
            #ctrlBtn:hover  { background:rgba(255,255,255,0.28); }
            #closeBtn {
                background:rgba(255,255,255,0.15); color:#fff;
                border:none; border-radius:7px; font-size:13px;
            }
            #closeBtn:hover { background:rgba(220,38,38,0.85); }
            #gripRow { background:transparent; }
            QLabel { color:rgba(255,255,255,0.85); font-size:11px; }
            QSlider::groove:horizontal {
                height:4px; background:rgba(255,255,255,0.28);
                border-radius:2px;
            }
            QSlider::sub-page:horizontal {
                background:rgba(255,255,255,0.85); border-radius:2px;
            }
            QSlider::handle:horizontal {
                width:14px; height:14px; margin:-5px 0;
                background:#fff; border-radius:7px;
            }
        """)

        # ── 플로팅 토글 버튼 ─────────────────────────────────────────
        self.toggle_btn = ToggleBtn(self.toggle_mode)

        # ── 전역 단축키 (Qt 내부 + global keyboard) ───────────────────
        sc = QShortcut(QKeySequence('Ctrl+Alt+C'), self)
        sc.activated.connect(self.toggle_mode)
        _hotkey_signal.triggered.connect(self.toggle_mode)

        # ── 트레이 ───────────────────────────────────────────────────
        self._setup_tray()

        # 초기 배치 및 모드
        screen = QApplication.primaryScreen().availableGeometry()
        self.setGeometry(screen.x() + 40, screen.y() + 40,
                         min(1360, screen.width() - 80),
                         min(840,  screen.height() - 80))
        self.set_mode(self.MODE_BG)

    # ── 모드 전환 ────────────────────────────────────────────────────
    def set_mode(self, mode: str):
        if mode == self._mode:
            return
        self._mode = mode
        hwnd = int(self.winId())

        if mode == self.MODE_BG:
            # 뒤로 내리기 + 클릭 투과
            self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, False)
            self.setWindowFlag(Qt.WindowType.WindowStaysOnBottomHint, True)
            self.show()
            _set_click_through(hwnd, True)
            self.set_opacity(65)
            self.titlebar.hide()
            self.titlebar.mode_badge.setText('')
            self.toggle_btn.set_icon(False)
            self.toggle_btn.show()
        else:
            # 최상위 + 상호작용
            _set_click_through(hwnd, False)
            self.setWindowFlag(Qt.WindowType.WindowStaysOnBottomHint, False)
            self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)
            self.show()
            self.activateWindow()
            self.raise_()
            self.set_opacity(self.titlebar.op_slider.value())
            self.titlebar.show()
            self.titlebar.mode_badge.setText('[ 수정 모드 ]')
            self.toggle_btn.set_icon(True)
            self.toggle_btn.show()

    def toggle_mode(self):
        next_mode = self.MODE_EDIT if self._mode == self.MODE_BG else self.MODE_BG
        self.set_mode(next_mode)

    def set_opacity(self, v: int):
        self.setWindowOpacity(v / 100)

    def hide_to_tray(self):
        self.hide()
        self.toggle_btn.hide()
        if self._tray:
            self._tray.showMessage('ASEA 업무 캘린더',
                                   '트레이로 이동. 아이콘 클릭으로 복원.',
                                   QSystemTrayIcon.MessageIcon.Information, 2000)

    # ── 시스템 트레이 ────────────────────────────────────────────────
    def _setup_tray(self):
        if not QSystemTrayIcon.isSystemTrayAvailable():
            self._tray = None
            return
        self._tray = QSystemTrayIcon(_emoji_icon('📅'), self)
        self._tray.setToolTip('ASEA 업무 캘린더 (Ctrl+Alt+C: 모드 전환)')
        self._tray.activated.connect(
            lambda r: self._show_from_tray()
            if r == QSystemTrayIcon.ActivationReason.Trigger else None
        )
        menu = QMenu()
        menu.addAction(QAction('📅 표시', self, triggered=self._show_from_tray))
        menu.addAction(QAction('🖊 수정 모드', self,
                               triggered=lambda: self.set_mode(self.MODE_EDIT)))
        menu.addAction(QAction('🖥 바탕화면 모드', self,
                               triggered=lambda: self.set_mode(self.MODE_BG)))
        menu.addSeparator()
        menu.addAction(QAction('종료', self, triggered=QApplication.quit))
        self._tray.setContextMenu(menu)
        self._tray.show()

    def _show_from_tray(self):
        self.showNormal()
        self.toggle_btn.show()
        self.activateWindow()
        self.raise_()

    def closeEvent(self, ev):
        ev.ignore()
        self.hide_to_tray()


# ── 진입점 ───────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(os.path.join(SCRIPT_DIR, HTML_FILE)):
        print(f'[오류] {HTML_FILE} 파일을 찾을 수 없습니다: {SCRIPT_DIR}')
        sys.exit(1)

    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )
    app = QApplication(sys.argv)
    app.setApplicationName('ASEA 업무 캘린더')
    app.setQuitOnLastWindowClosed(False)

    win = CalendarOverlay()
    win.setWindowTitle('ASEA 업무 캘린더')
    win.show()
    win.toggle_btn.show()

    sys.exit(app.exec())


if __name__ == '__main__':
    main()
