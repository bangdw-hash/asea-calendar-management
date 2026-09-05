"""
ASEA 업무 캘린더 — 데스크탑 오버레이
======================================
실행: python desktop_overlay.py

필요 패키지:
    pip install PyQt6 PyQt6-WebEngine

기능:
  - schedule.html을 반투명 플로팅 창에 렌더링
  - 타이틀바 드래그로 위치 이동
  - 투명도 슬라이더 (20 ~ 100%)
  - 항상 위(📌) 토글
  - 창 크기 조절 (우하단 코너 드래그)
  - 트레이 아이콘 → 우클릭 메뉴로 숨기기/표시/종료
"""

import sys
import os
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QSlider, QPushButton, QLabel, QSystemTrayIcon, QMenu, QSizeGrip,
)
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtCore import Qt, QUrl, QPoint, QSize
from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor, QAction, QFont


# ── 스크립트 위치에서 schedule.html 찾기 ──────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_PATH  = os.path.join(SCRIPT_DIR, 'schedule.html')


def _make_emoji_icon(emoji: str, size: int = 64) -> QIcon:
    """이모지를 QIcon으로 변환 (트레이 아이콘용)"""
    px = QPixmap(size, size)
    px.fill(Qt.GlobalColor.transparent)
    p = QPainter(px)
    f = QFont()
    f.setPixelSize(int(size * 0.75))
    p.setFont(f)
    p.drawText(px.rect(), Qt.AlignmentFlag.AlignCenter, emoji)
    p.end()
    return QIcon(px)


class TitleBar(QWidget):
    """드래그 가능한 커스텀 타이틀바"""

    def __init__(self, parent: 'CalendarOverlay'):
        super().__init__(parent)
        self.parent_win = parent
        self._drag_pos: QPoint | None = None
        self.setFixedHeight(40)
        self.setObjectName('titlebar')

        layout = QHBoxLayout(self)
        layout.setContentsMargins(14, 0, 8, 0)
        layout.setSpacing(6)

        # 제목
        title = QLabel('📅  아세아 업무 캘린더')
        title.setObjectName('titleLabel')
        layout.addWidget(title)
        layout.addStretch()

        # 투명도 레이블 + 슬라이더
        op_label = QLabel('투명도')
        op_label.setObjectName('ctrlLabel')
        self.op_slider = QSlider(Qt.Orientation.Horizontal)
        self.op_slider.setRange(20, 100)
        self.op_slider.setValue(92)
        self.op_slider.setFixedWidth(90)
        self.op_slider.setToolTip('창 투명도 조절')
        self.op_slider.valueChanged.connect(parent.set_opacity)
        layout.addWidget(op_label)
        layout.addWidget(self.op_slider)
        layout.addSpacing(6)

        # 항상 위 고정 버튼
        self.pin_btn = QPushButton('📌')
        self.pin_btn.setObjectName('ctrlBtn')
        self.pin_btn.setFixedSize(30, 30)
        self.pin_btn.setCheckable(True)
        self.pin_btn.setChecked(True)
        self.pin_btn.setToolTip('항상 위에 고정')
        self.pin_btn.toggled.connect(parent.set_on_top)
        layout.addWidget(self.pin_btn)

        # 최소화
        min_btn = QPushButton('—')
        min_btn.setObjectName('ctrlBtn')
        min_btn.setFixedSize(30, 30)
        min_btn.setToolTip('최소화')
        min_btn.clicked.connect(parent.showMinimized)
        layout.addWidget(min_btn)

        # 닫기
        close_btn = QPushButton('✕')
        close_btn.setObjectName('closeBtn')
        close_btn.setFixedSize(30, 30)
        close_btn.setToolTip('닫기 (트레이로 이동)')
        close_btn.clicked.connect(parent.hide_to_tray)
        layout.addWidget(close_btn)

    # 드래그로 창 이동
    def mousePressEvent(self, ev):
        if ev.button() == Qt.MouseButton.LeftButton:
            self._drag_pos = ev.globalPosition().toPoint() - self.parent_win.frameGeometry().topLeft()

    def mouseMoveEvent(self, ev):
        if ev.buttons() == Qt.MouseButton.LeftButton and self._drag_pos is not None:
            self.parent_win.move(ev.globalPosition().toPoint() - self._drag_pos)

    def mouseReleaseEvent(self, ev):
        self._drag_pos = None

    def mouseDoubleClickEvent(self, ev):
        # 더블클릭으로 최대화/복원
        if self.parent_win.isMaximized():
            self.parent_win.showNormal()
        else:
            self.parent_win.showMaximized()


class CalendarOverlay(QMainWindow):
    def __init__(self):
        super().__init__()

        # 프레임리스 + 반투명 배경
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool,          # 작업 표시줄에 표시 안 함
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setMinimumSize(QSize(600, 400))
        self.setGeometry(120, 80, 1300, 800)

        # ── 루트 컨테이너 ────────────────────────────────────────────
        root = QWidget()
        root.setObjectName('root')
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)

        # 타이틀바
        self.titlebar = TitleBar(self)
        root_layout.addWidget(self.titlebar)

        # 웹뷰 (Chromium)
        self.webview = QWebEngineView()
        settings = self.webview.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.AllowRunningInsecureContent, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        self.webview.load(QUrl.fromLocalFile(HTML_PATH))
        root_layout.addWidget(self.webview, stretch=1)

        # 우하단 크기 조절 그립
        grip_row = QWidget()
        grip_row.setObjectName('gripRow')
        grip_row.setFixedHeight(14)
        grip_layout = QHBoxLayout(grip_row)
        grip_layout.setContentsMargins(0, 0, 4, 2)
        grip_layout.addStretch()
        grip = QSizeGrip(self)
        grip.setFixedSize(14, 14)
        grip_layout.addWidget(grip)
        root_layout.addWidget(grip_row)

        self.setCentralWidget(root)
        self.set_opacity(92)

        # ── 스타일 ───────────────────────────────────────────────────
        self.setStyleSheet("""
            #root {
                background: rgba(255, 255, 255, 0.93);
                border-radius: 14px;
                border: 1.5px solid rgba(0, 0, 0, 0.12);
            }
            #titlebar {
                background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
                    stop:0 #1a73e8, stop:1 #1557b0);
                border-radius: 12px 12px 0 0;
            }
            #titleLabel {
                color: #ffffff;
                font-weight: 700;
                font-size: 13px;
                letter-spacing: 0.3px;
            }
            #ctrlLabel {
                color: rgba(255,255,255,0.8);
                font-size: 11px;
            }
            #ctrlBtn {
                background: rgba(255,255,255,0.14);
                color: #ffffff;
                border: none;
                border-radius: 7px;
                font-size: 14px;
            }
            #ctrlBtn:hover  { background: rgba(255,255,255,0.28); }
            #ctrlBtn:checked{ background: rgba(255,255,255,0.35); }
            #closeBtn {
                background: rgba(255,255,255,0.14);
                color: #ffffff;
                border: none;
                border-radius: 7px;
                font-size: 13px;
            }
            #closeBtn:hover { background: rgba(220,38,38,0.85); }
            #gripRow { background: transparent; }
            QSlider::groove:horizontal {
                height: 4px;
                background: rgba(255,255,255,0.28);
                border-radius: 2px;
            }
            QSlider::sub-page:horizontal {
                background: rgba(255,255,255,0.85);
                border-radius: 2px;
            }
            QSlider::handle:horizontal {
                width: 14px; height: 14px;
                margin: -5px 0;
                background: #ffffff;
                border-radius: 7px;
                border: 2px solid rgba(255,255,255,0.5);
            }
        """)

        # ── 시스템 트레이 ─────────────────────────────────────────────
        self._setup_tray()

    # ── 기능 메서드 ──────────────────────────────────────────────────
    def set_opacity(self, value: int):
        self.setWindowOpacity(value / 100)

    def set_on_top(self, checked: bool):
        flags = self.windowFlags()
        if checked:
            flags |= Qt.WindowType.WindowStaysOnTopHint
        else:
            flags &= ~Qt.WindowType.WindowStaysOnTopHint
        self.setWindowFlags(flags)
        self.show()

    def hide_to_tray(self):
        self.hide()
        if self._tray:
            self._tray.showMessage(
                'ASEA 업무 캘린더',
                '트레이로 이동했습니다. 트레이 아이콘을 클릭하면 다시 표시됩니다.',
                QSystemTrayIcon.MessageIcon.Information,
                2000,
            )

    def _setup_tray(self):
        if not QSystemTrayIcon.isSystemTrayAvailable():
            self._tray = None
            return
        icon = _make_emoji_icon('📅')
        self._tray = QSystemTrayIcon(icon, self)
        self._tray.setToolTip('ASEA 업무 캘린더')
        self._tray.activated.connect(self._tray_activated)

        menu = QMenu()
        show_act  = QAction('표시', self)
        show_act.triggered.connect(self._show_from_tray)
        quit_act  = QAction('종료', self)
        quit_act.triggered.connect(QApplication.quit)
        menu.addAction(show_act)
        menu.addSeparator()
        menu.addAction(quit_act)
        self._tray.setContextMenu(menu)
        self._tray.show()

    def _tray_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            self._show_from_tray()

    def _show_from_tray(self):
        self.showNormal()
        self.activateWindow()
        self.raise_()

    def closeEvent(self, ev):
        # X 버튼(시스템)도 트레이로
        ev.ignore()
        self.hide_to_tray()


def main():
    if not os.path.exists(HTML_PATH):
        print(f'[오류] schedule.html을 찾을 수 없습니다:\n  {HTML_PATH}')
        sys.exit(1)

    # HiDPI 스케일링 활성화
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )
    app = QApplication(sys.argv)
    app.setApplicationName('ASEA 업무 캘린더')
    app.setQuitOnLastWindowClosed(False)   # 트레이에서 계속 실행

    win = CalendarOverlay()
    win.setWindowTitle('ASEA 업무 캘린더')
    win.show()

    sys.exit(app.exec())


if __name__ == '__main__':
    main()
