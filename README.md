# Sheet Music Viewer

Webpage xem và luyện tập bản nhạc từ file MusicXML (`.mxl`/`.xml`) — render sheet nhạc gọn gàng, phát nhạc, transpose, hiện hợp âm/tên nốt, và luyện tập trực tiếp bằng đàn MIDI thật qua USB.

## Tính năng

### Render & xem bản nhạc
- Upload file `.mxl` (nén) hoặc `.xml`/`.musicxml` (thô), xử lý hoàn toàn phía client, không upload lên server.
- Giao diện tối giản: chỉ giữ lại bản nhạc + thanh điều khiển, bỏ hết phần rườm rà.

### Phát nhạc
- Phát bằng piano soundfont thật (Tone.js + Salamander), điều chỉnh được tempo (BPM).
- Con trỏ chạy theo đúng nốt đang phát, đồng bộ chính xác.
- Bấm vào bất kỳ nốt nào trên bản nhạc để cursor nhảy tới đó và tiếp tục phát từ vị trí đó.

### Transpose
- Tăng/giảm nửa cung hoặc nguyên cung.
- Transpose đúng nghĩa (diatonic) — đổi cả key signature (số dấu thăng/giáng), không chỉ dịch cao độ.

### Hợp âm
- Tự đọc hợp âm có sẵn trong file (`<harmony>`), hoặc tự động phân tích từ các nốt ở khóa Fa nếu file chưa có.
- Hiển thị ở vị trí chuẩn (trên khuông khóa Sol), tự transpose theo cùng bản nhạc.
- Có thể ẩn/hiện hợp âm bằng 1 nút bấm.

### Tên nốt
- Hiện tên nốt (C D E F G A B) ngay giữa từng notehead, có viền tương phản để đọc rõ trên cả nốt đặc lẫn nốt rỗng.
- Bật/tắt độc lập.

### Practice Mode (đàn MIDI)
- Kết nối đàn MIDI thật qua USB (Web MIDI API) — không cần driver cho đàn class-compliant.
- Đánh đúng nốt đang mong đợi tại cursor → cursor tự chuyển sang nốt tiếp theo (chớp xanh lá).
- Đánh sai → cursor đứng yên, hiện đỏ để nhắc, không cần chờ cooldown, sửa đúng là đi tiếp ngay.
- Hỗ trợ hợp âm (đánh đủ và đúng tập hợp nốt, đánh thừa nốt cũng tính là sai).
- Tùy chọn phát âm thanh qua loa máy tính khi bấm phím (hữu ích cho đàn MIDI-only không có loa riêng), hỗ trợ pedal sustain.
- Yêu cầu trình duyệt hỗ trợ Web MIDI (Chrome/Edge) — Safari chưa hỗ trợ.

## Chạy dự án

```bash
cd app
npm install
npm run dev
```

Các lệnh khác:

```bash
npm run build     # build production
npm run lint      # kiểm tra lint (oxlint)
npm run preview   # xem thử bản build
```

## Công nghệ

- **React + Vite + TypeScript**
- **[OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)** — render notation từ MusicXML, transpose, cursor
- **[Tone.js](https://tonejs.github.io/)** — phát âm thanh piano
- **[tonal](https://github.com/tonaljs/tonal)** — phân tích hợp âm
- **Web MIDI API** — kết nối đàn MIDI qua USB

## Cấu trúc

```
app/            # source code chính (React + Vite)
  src/
    components/ # UI components
    hooks/      # React hooks (OSMD, playback, practice mode, MIDI...)
    lib/        # logic thuần (chord detection, pitch conversion, MIDI matching...)
example/        # file .mxl mẫu để test
specs/          # tài liệu requirement/plan cho từng tính năng
```
