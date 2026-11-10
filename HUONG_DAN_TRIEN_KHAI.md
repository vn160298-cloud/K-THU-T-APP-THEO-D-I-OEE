# HƯỚNG DẪN TRIỂN KHAI — KỸ THUẬT - THEO DÕI OEE

Thời gian làm khoảng 20–30 phút. Không cần cài phần mềm gì, chỉ cần trình duyệt.

---

## Bước 1 — Tạo database trên Supabase

1. Vào https://supabase.com, đăng nhập rồi bấm **New project**.
   - Name: `theo-doi-oee` · Region: **Southeast Asia (Singapore)** · đặt Database password và **lưu lại mật khẩu này**.
2. Chờ khoảng 2 phút cho project tạo xong. Mở **SQL Editor**, bấm **New query**.
3. Mở file `supabase/01_schema.sql`, chép **toàn bộ** nội dung, dán vào SQL Editor rồi bấm **Run**.
   Kết quả báo *Success*. File này chạy lại nhiều lần cũng không mất dữ liệu.
4. Tạo query mới, dán toàn bộ `supabase/02_seed.sql` rồi bấm **Run**.
   Bước này nạp sẵn Nhà máy Bình Chiểu, 21 máy, 380 mã lỗi, 3 ca, sản phẩm mẫu và nhân sự mẫu.
5. Tạo **tài khoản Admin đầu tiên**: tạo query mới, sửa mã, tên và PIN rồi chạy:
   ```sql
   select public.khoi_tao_admin('ADMIN01', 'Họ tên của bạn', '123456');
   ```
6. Vào **Project Settings → API**, chép 2 giá trị:
   - **Project URL**, dạng `https://abcdxyz.supabase.co`
   - **anon public key**, là chuỗi dài bắt đầu bằng `eyJ...`
7. Mở file `js/config.js` và thay vào 2 dòng:
   ```js
   export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
   > Anon key là khóa công khai, để trong mã nguồn được. Dữ liệu được bảo vệ bằng phân quyền RLS trong database, người chưa đăng nhập không đọc hay ghi được.
   > **Không bao giờ** dán khóa `service_role` vào app.

## Bước 2 — Đưa app lên GitHub Pages

1. Vào https://github.com, đăng nhập rồi chọn **New repository**.
   - Tên: `theo-doi-oee` · chọn **Public** (GitHub gói thường chỉ chạy Pages với repo Public).
2. Trong repo vừa tạo, bấm **uploading an existing file** và kéo thả **toàn bộ nội dung thư mục app** vào:
   `index.html`, `manifest.webmanifest`, `sw.js`, các thư mục `css/`, `js/`, `icons/`.
   - Thư mục `supabase/`, `tools/` và file Excel **không cần** đưa lên (file `.gitignore` đã loại sẵn file Excel).
   - Bấm **Commit changes**.
3. Vào **Settings → Pages**: Source chọn **Deploy from a branch**, Branch chọn `main` / `(root)`, rồi bấm **Save**.
4. Sau 1–2 phút, app chạy ở địa chỉ: `https://<tên-github>.github.io/theo-doi-oee/`

## Bước 3 — Cài lên điện thoại (chạy như app thật)

- **iPhone:** mở link bằng **Safari**, bấm nút Chia sẻ rồi chọn **Thêm vào MH chính**.
- **Android:** mở link bằng **Chrome**, bấm menu ⋮ rồi chọn **Thêm vào màn hình chính** (hoặc **Cài đặt ứng dụng**).

Mở app từ biểu tượng NutriNest trên màn hình chính, app chạy toàn màn hình, không có thanh địa chỉ.

## Bước 4 — Thiết lập ban đầu (đăng nhập bằng Admin)

Vào **Danh mục**:
1. **Nhân sự**: thêm 40 người dùng (mã NV, họ tên, vai trò, bộ phận), sau đó bấm **Cấp PIN** cho từng người.
   Có thể xóa các nhân sự mẫu VH01, TT01, KT01, QL01.
2. **Sản phẩm**: sửa hoặc thêm sản phẩm thật, xóa các dòng "(mẫu)".
3. **Tốc độ định mức**: chọn từng máy rồi nhập số sp/phút cho từng sản phẩm. **Bắt buộc phải có bước này để tính OEE.**
4. **Mã lỗi**: duyệt lại cột *Nhóm 6 tổn thất* mà app đã gán sẵn. Với 7 máy đang dùng tạm bộ mã BĐG1 (BNHV, BNHR, BTC, BTD, BGV, BLC, BMCHQ), sửa lại mã và tên lỗi đúng.
5. **Ca làm việc**: kiểm tra giờ ca và số phút nghỉ. Khi Đóng gói chia Ca 1/Ca 2 thì thêm ca cho bộ phận Đóng gói.
6. **Khu vực / Line**, **Dây chuyền**: khai báo dây chuyền sản phẩm (máy cuối, máy nút cổ chai) để tính OEE dây chuyền.
7. **Cài đặt**: ngưỡng dừng ngắn (mặc định 5 phút), số giờ cảnh báo lỗi quá hạn (mặc định 4 giờ).

Dữ liệu cũ: vào **Nhập dữ liệu cũ**, tải file Excel mẫu, điền rồi tải lên.

## Phân quyền

| Vai trò | Được làm |
|---|---|
| Vận hành | Ghi phiếu, sửa phiếu của mình khi chưa khóa, xem dashboard |
| Tổ trưởng | Ghi phiếu, **xác nhận và khóa phiếu** |
| Kỹ thuật | **Cập nhật tình trạng lỗi** (kể cả sau khi phiếu đã khóa) |
| Quản lý | Sửa, xóa, mở khóa phiếu đã khóa, cập nhật tình trạng lỗi |
| Admin | Tất cả, cộng quản lý Danh mục và cấp PIN. Admin để trống "Nhà máy" là **admin tổng** (xem mọi nhà máy) |

## Mở rộng cho nhà máy 2, 3

Đăng nhập bằng admin tổng, vào **Danh mục → Nhà máy** để thêm nhà máy. Sau đó vào **Tài khoản → Nhà máy đang xem** để chuyển sang nhà máy mới và khai báo bộ phận, máy, ca, nhân sự cho nhà máy đó.
Người dùng của mỗi nhà máy chỉ thấy dữ liệu của nhà máy mình.

## Cập nhật app về sau

1. Sửa file, rồi **tăng số phiên bản** ở dòng `const VERSION = 'oee-v1.0.1'` trong `sw.js` (và `APP_VERSION` trong `js/config.js`).
2. Tải file mới lên GitHub. Lần mở app kế tiếp, điện thoại sẽ tự nhận bản mới. Cũng có thể vào **Tài khoản → Tải lại dữ liệu & bản mới**.

Nếu sửa database thì chạy lại `supabase/01_schema.sql` (an toàn khi chạy lại).

## Sao lưu

Supabase gói miễn phí **không** tự sao lưu. Định kỳ hằng tháng nên vào **Báo cáo**, chọn kỳ Tháng rồi **Xuất Excel** để lưu trữ.
Khi chuyển tài khoản Supabase sang email công ty: vào **Organization settings → Members** để mời email công ty làm Owner.

## Ghi chú kỹ thuật

- Khi mất mạng: phiếu được lưu trên máy (localStorage) và tự gửi khi có mạng. Phiếu nháp đồng bộ giữa các thiết bị qua bảng `nhap_phieu`.
- Đăng nhập: mã NV được đổi thành email nội bộ `<mã>@oee.nutrinest.local`, PIN được đổi thành mật khẩu `NN-<PIN>-OEE` (Supabase yêu cầu mật khẩu ≥ 6 ký tự).
- Công thức xem trong `DAC_TA_APP.md` mục 5 và file `js/kpi.js`.
- `tools/tao_seed.py` dùng để sinh lại `02_seed.sql` từ file Excel nếu cần.
