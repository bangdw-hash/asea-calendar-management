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

from PyQt5.QtCore import Qt, QUrl, QPoint, QTimer
from PyQt5.QtGui import QIcon, QColor
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QSlider, QLabel, QSizeGrip, QSizePolicy
)
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineProfile, QWebEnginePage

CALENDAR_URL = "https://bangdw-hash.github.io/asea-calendar-management/schedule.html"

# ── 컨트롤 바 (드래그 + 투명도 + 버튼) ──────────────────────────────────────
class ControlBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(38)
        self.setObjectName("controlBar")
        self.setStyleSheet("""
            #controlBar {
                background: rgba(30, 30, 30, 200);
                border-top-left-radius: 14px;
                border-top-right-radius: 14px;
            }
            QPushButton {
                background: transparent;
                color: #ccc;
                border: none;
                font-size: 14px;
                padding: 4px 8px;
                border-radius: 6px;
            }
            QPushButton:hover { background: rgba(255,255,255,40); color: #fff; }
            QPushButton#btnClose:hover { background: rgba(255,60,60,180); color: #fff; }
            QPushButton#btnPin { font-size: 11px; color: #aaa; }
            QPushButton#btnPin[pinned="true"] { color: #7eb8f7; }
            QLabel#titleLabel {
                color: #bbb;
                font-size: 12px;
                font-family: 'Segoe UI', sans-serif;
            }
            QSlider::groove:horizontal {
                height: 4px;
                background: rgba(255,255,255,60);
                border-radius: 2px;
            }
            QSlider::handle:horizontal {
                width: 12px; height: 12px;
                margin: -4px 0;
                background: #7eb8f7;
                border-radius: 6px;
            }
            QSlider::sub-page:horizontal {
                background: #7eb8f7;
                border-radius: 2px;
            }
            QLabel#opacityLabel { color: #aaa; font-size: 11px; min-width: 28px; }
        """)

        self._drag_pos = None

        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 0, 8, 0)
        layout.setSpacing(4)

        # 타이틀
        title = QLabel("📅 ASEA 캘린더")
        title.setObjectName("titleLabel")
        layout.addWidget(title)

        layout.addStretch()

        # 투명도 슬라이더
        opaque_icon = QLabel("◑")
        opaque_icon.setStyleSheet("color:#888;font-size:12px;")
        layout.addWidget(opaque_icon)

        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(20, 100)
        self.slider.setValue(95)
        self.slider.setFixedWidth(80)
        self.slider.setToolTip("투명도")
        layout.addWidget(self.slider)

        self.opacity_label = QLabel("95%")
        self.opacity_label.setObjectName("opacityLabel")
        layout.addWidget(self.opacity_label)

        layout.addSpacing(6)

        # 항상 위 핀 버튼
        self.btn_pin = QPushButton("📌")
        self.btn_pin.setObjectName("btnPin")
        self.btn_pin.setToolTip("항상 위 고정 ON/OFF")
        self.btn_pin.setFixedSize(28, 28)
        self.btn_pin.setProperty("pinned", "true")
        layout.addWidget(self.btn_pin)

        # 새로고침
        btn_refresh = QPushButton("↺")
        btn_refresh.setToolTip("새로고침")
        btn_refresh.setFixedSize(28, 28)
        layout.addWidget(btn_refresh)

        # 최소화
        btn_min = QPushButton("−")
        btn_min.setToolTip("최소화")
        btn_min.setFixedSize(28, 28)
        layout.addWidget(btn_min)

        # 닫기
        self.btn_close = QPushButton("✕")
        self.btn_close.setObjectName("btnClose")
        self.btn_close.setToolTip("닫기")
        self.btn_close.setFixedSize(28, 28)
        layout.addWidget(self.btn_close)

        # 외부에서 연결할 수 있도록 버튼 노출
        self.btn_refresh = btn_refresh
        self.btn_min = btn_min

    # 드래그 이동
    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self._drag_pos = e.globalPos() - self.window().frameGeometry().topLeft()

    def mouseMoveEvent(self, e):
        if e.buttons() == Qt.LeftButton and self._drag_pos:
            self.window().move(e.globalPos() - self._drag_pos)

    def mouseReleaseEvent(self, e):
        self._drag_pos = None


# ── 메인 윈도우 ──────────────────────────────────────────────────────────────
class CalendarWidget(QMainWindow):
    def __init__(self):
        super().__init__()
        self._pinned = True
        self._setup_window()
        self._build_ui()
        self._connect_signals()

    def _setup_window(self):
        self.setWindowTitle("ASEA 캘린더")
        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.Tool               # 작업 표시줄 미표시
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.resize(420, 680)

        # 화면 오른쪽 상단에 초기 배치
        screen = QApplication.primaryScreen().availableGeometry()
        self.move(screen.right() - self.width() - 20, screen.top() + 40)

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

        # 컨트롤 바
        self.bar = ControlBar()
        layout.addWidget(self.bar)

        # 웹뷰
        profile = QWebEngineProfile("asea_calendar", self)
        profile.setPersistentCookiesPolicy(QWebEngineProfile.AllowPersistentCookies)
        profile.setHttpCacheType(QWebEngineProfile.DiskHttpCache)

        self.web = QWebEngineView()
        page = QWebEnginePage(profile, self.web)
        self.web.setPage(page)
        self.web.setUrl(QUrl(CALENDAR_URL))
        self.web.setStyleSheet("border-bottom-left-radius:14px;border-bottom-right-radius:14px;")

        layout.addWidget(self.web)

        # 크기 조절 핸들 (우하단)
        grip = QSizeGrip(self)
        grip.setFixedSize(16, 16)
        grip_layout = QHBoxLayout()
        grip_layout.addStretch()
        grip_layout.addWidget(grip)
        grip_layout.setContentsMargins(0, 0, 2, 2)
        layout.addLayout(grip_layout)

    def _connect_signals(self):
        self.bar.slider.valueChanged.connect(self._on_opacity)
        self.bar.btn_close.clicked.connect(self.close)
        self.bar.btn_refresh.clicked.connect(self.web.reload)
        self.bar.btn_min.clicked.connect(self.showMinimized)
        self.bar.btn_pin.clicked.connect(self._toggle_pin)

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
        # 플래그 변경 후 재표시
        self.setWindowFlags(flags)
        self.show()

    # 창 테두리 없이 크기 조절 (마우스 우하단 영역)
    def resizeEvent(self, e):
        super().resizeEvent(e)


# ── 진입점 ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # High-DPI: QApplication 생성 전에 환경변수로 설정 (PyQt5 경고 없음)
    os.environ.setdefault("QT_AUTO_SCREEN_SCALE_FACTOR", "1")

    app = QApplication(sys.argv)
    app.setApplicationName("ASEA Calendar Widget")

    win = CalendarWidget()
    win.show()
    sys.exit(app.exec_())
