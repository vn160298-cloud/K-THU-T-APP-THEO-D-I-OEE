# ĐẶC TẢ APP: KỸ THUẬT - THEO DÕI OEE

> Phiên bản đặc tả: v1.1 (05/11/2026), **đã chốt và đã làm xong**. Triển khai theo `HUONG_DAN_TRIEN_KHAI.md`
> Phạm vi giai đoạn 1: **Nhà máy Bình Chiểu**. Từ đầu thiết kế sẵn để mở rộng cho nhà máy 2 và 3.
> Giao diện: skill `/background-soan-app` (NutriNest Factory, bộ phận **Kỹ thuật**)

---

## 1. Kiến trúc

| Thành phần | Công nghệ |
|---|---|
| App | **PWA** (Progressive Web App): HTML/JS, `manifest.json` và Service Worker. Có thể "Thêm vào màn hình chính" trên iPhone và Android, mở ra chạy toàn màn hình, không có thanh địa chỉ |
| Chạy web | **GitHub Pages** (HTTPS, miễn phí) |
| Dữ liệu | **Supabase**: PostgreSQL, Auth, phân quyền theo dòng (RLS), Edge Functions và lịch chạy tự động (cron) |
| Ngoại tuyến | Phiếu được lưu trên máy (localStorage) và vào hàng đợi đồng bộ. Khi có mạng, app tự gửi lên Supabase. Service Worker giữ sẵn giao diện để mở app khi mất mạng |
| Phiếu dang dở | Tự lưu nháp theo **từng tài khoản**. Thoát app rồi đăng nhập lại vẫn còn. Khi có mạng, bản nháp cũng được lưu lên server, nên đổi sang điện thoại khác vẫn mở tiếp được |
| Nhiều nhà máy | Mọi bảng dữ liệu đều có `nha_may_id`. Mỗi người dùng thuộc 1 nhà máy, Admin tổng xem được tất cả |

Quy mô: khoảng 40 người dùng, khoảng 10 người dùng cùng lúc. Gói miễn phí của Supabase đủ đáp ứng.

---

## 2. Đăng nhập và phân quyền

- Đăng nhập bằng **mã nhân viên + PIN 4–6 số**. Admin tạo tài khoản và đặt lại PIN khi cần.

| Quyền | Vận hành | Tổ trưởng | Kỹ thuật | Quản lý | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Tạo và sửa phiếu của mình (trước khi khóa) | ✅ | ✅ | | | ✅ |
| Xác nhận phiếu (khóa phiếu) | | ✅ | | | ✅ |
| Cập nhật tình trạng xử lý lỗi | | | ✅ | ✅ | ✅ |
| Sửa hoặc xóa phiếu đã khóa | | | | ✅ | ✅ |
| Xem dashboard và báo cáo | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quản lý danh mục và người dùng | | | | | ✅ |

---

## 3. Danh mục (Admin thêm, sửa, xóa ngay trong app, và dùng làm danh sách xổ xuống)

| Danh mục | Trường dữ liệu |
|---|---|
| Nhà máy | Tên (khởi tạo: *Bình Chiểu*) |
| Bộ phận | **Sản xuất / Đóng gói** (có thể thêm) |
| Khu vực / Line | Danh sách xổ xuống, thêm và bớt tự do |
| Máy | Mã, tên, bộ phận, khu vực/line, **OEE mục tiêu và ngưỡng màu riêng**, trạng thái đang dùng hoặc ngưng |
| Mã lỗi (riêng từng máy) | Mã, tên lỗi, **nhóm 6 tổn thất**, **loại lỗi** (Cơ / Điện / Vận hành / Nguyên liệu / Tiện ích / Chất lượng) |
| Lý do dừng có kế hoạch (dùng chung) | Nghỉ ăn, họp đầu ca, bảo trì định kỳ, không có đơn hàng (có thể thêm) |
| Sản phẩm | Mã, tên, quy cách |
| Tốc độ định mức | **Máy × Sản phẩm → số sản phẩm/phút** |
| Ca làm việc | Theo nhà máy và bộ phận: tên ca, giờ bắt đầu, giờ kết thúc, **số phút nghỉ giữa ca** (tùy chỉnh được) |
| Dây chuyền sản phẩm | Chuỗi máy theo thứ tự để tính OEE dây chuyền, có đánh dấu **máy cuối** và **máy nút cổ chai** |
| Nhân sự | Mã NV, họ tên, vai trò, bộ phận, nhà máy |

**Dữ liệu mẫu nạp sẵn**
- 21 máy và toàn bộ mã lỗi lấy từ file `THEO DÕI HOẠT ĐỘNG MÁY MÓC.xlsx`. 7 máy BNHV, BNHR, BTC, BTD, BGV, BLC, BMCHQ đang dùng tạm bộ mã của BĐG1, Admin sửa sau.
- Nhóm 6 tổn thất được mình gán sẵn cho từng mã lỗi để bạn duyệt.
- Ca: Ca 1, Ca 2 (Sản xuất) và Ca HC (Đóng gói), nghỉ 30 phút. Giờ mặc định chỉnh được.
- Vài sản phẩm mẫu và vài nhân sự mẫu để bạn sửa.

---

## 4. Phiếu ghi nhận vận hành

**Khóa duy nhất:** Nhà máy + Bộ phận + Máy + Ngày + Ca. App chặn tạo phiếu trùng.

**Phần đầu phiếu:** Ngày (chọn trên **lịch**), Ca, Bộ phận, Máy, Sản phẩm, Người vận hành, Tổ trưởng, Kỹ thuật (đều là danh sách xổ xuống). Giờ bắt đầu và giờ kết thúc ca.

**Sản lượng:** Tổng sản lượng, **SL lỗi khởi động**, **SL lỗi trong quá trình chạy**. App tự tính SL đạt.

**Dừng có kế hoạch:** chọn lý do, nhập giờ bắt đầu và giờ kết thúc.

**Các lần dừng máy (thêm không giới hạn):**

| Trường | Cách nhập |
|---|---|
| Tên lỗi | Danh sách xổ xuống có ô tìm kiếm, chỉ hiện bộ mã của máy đang chọn |
| Mã lỗi, Nhóm 6 tổn thất, Loại lỗi | **Tự điền** khi chọn tên lỗi |
| Giờ bắt đầu và giờ kết thúc | Nhập giờ, app **tự tính số phút** |
| Dừng ngắn | Lần dừng **dưới 5 phút** tự xếp vào nhóm "Dừng ngắn / chạy không tải" |
| Vấn đề chất lượng | Ghi tự do |
| Người xử lý | Chọn từ danh sách |
| Tình trạng lỗi | **Chờ xử lý / Chờ vật tư / Đã xử lý / Chưa khắc phục được** |
| Ghi chú | Ghi tự do |

**Luồng phiếu:** Nháp → Đã gửi → **Tổ trưởng xác nhận (khóa phiếu)**. Sau khi khóa, chỉ Quản lý và Admin được sửa hoặc xóa.

---

## 5. Công thức tính

| Ký hiệu | Công thức |
|---|---|
| Thời gian ca | Giờ kết thúc − Giờ bắt đầu |
| **PPT** (thời gian chạy kế hoạch) | Thời gian ca − Nghỉ giữa ca − Dừng có kế hoạch |
| **Run time** | PPT − Tổng thời gian dừng tổn thất |
| CT lý tưởng | 1 / Tốc độ định mức (máy × sản phẩm) |
| **Availability (A)** | Run time / PPT |
| **Performance (P)** | (Tổng SL × CT lý tưởng) / Run time |
| **Quality (Q)** | SL đạt / Tổng SL |
| **OEE** | A × P × Q |
| **TEEP** | Thời gian sản xuất hiệu quả / Thời gian lịch (24h × số ngày × số máy có số liệu trong kỳ) |
| **MTBF** | Run time / Số lần dừng do **hỏng hóc thiết bị** |
| **MTTR** | Tổng phút dừng do hỏng hóc / Số lần dừng do hỏng hóc |

**Six Big Losses** (quy đổi tất cả ra phút để vẽ biểu đồ Pareto):
1. Hỏng hóc thiết bị: tổng phút các lần dừng thuộc nhóm 1
2. Chuẩn bị / điều chỉnh: vệ sinh, đổi dòng sản phẩm, đổi tem/chai/nắp…
3. Dừng ngắn / chạy không tải: các lần dừng dưới 5 phút và các mã thuộc nhóm 3
4. Giảm tốc độ: Run time − Tổng SL × CT lý tưởng
5. Lỗi trong quá trình: SL lỗi quá trình × CT lý tưởng
6. Lỗi khởi động: SL lỗi khởi động × CT lý tưởng

**OPE: OEE dây chuyền và OEE nhà máy** (đề xuất)
- **OEE dây chuyền sản phẩm** = (SL đạt ở **máy cuối** × CT lý tưởng của **máy nút cổ chai**) / PPT của dây chuyền
- **OEE toàn nhà máy** = Σ thời gian sản xuất hiệu quả / Σ PPT của tất cả máy, tức trung bình có trọng số theo thời gian

**Ngưỡng màu mặc định:** xanh ≥ 85%, vàng 60–85%, đỏ < 60%. Chỉnh riêng được cho từng máy.

---

## 6. Dashboard, lịch và báo cáo

- **Hôm nay:** danh sách phiếu đã ghi nhận trong ngày. Bảng trạng thái từng máy gồm: đã có phiếu chưa, số lỗi theo từng tình trạng, OEE của ca.
- **Thẻ chỉ số:** OEE, A, P, Q, TEEP, OPE, MTBF, MTTR, lọc theo khoảng ngày chọn trên **lịch**, nhà máy, bộ phận, máy, sản phẩm.
- **Biểu đồ:** OEE theo ngày, **Pareto lỗi**, **6 tổn thất lớn**, bảng xếp hạng máy.
- **Lịch tháng:** mỗi ngày tô màu theo OEE, có số lỗi chưa xử lý. Bấm vào ngày nào thì xem danh sách phiếu ngày đó.
- **Danh sách lỗi cần xử lý:** dành cho Kỹ thuật, lọc theo tình trạng, cập nhật nhanh.
- **Xuất báo cáo:** Excel và PDF theo ngày, tuần, tháng, dùng **mẫu phiếu mới**.

---

## 7. Thông báo Zalo (chốt phương án b)
Mỗi lần dừng máy có nút **"Gửi qua Zalo"**. App soạn sẵn nội dung (máy, ca, lỗi, thời gian, tình trạng, link phiếu) rồi mở bảng chia sẻ của điện thoại để chọn nhóm Zalo. Nếu thiết bị không có bảng chia sẻ, app chép nội dung vào bộ nhớ tạm để dán.
App không tự gửi tin. Lỗi quá X giờ (mặc định 4, tính từ lúc máy bắt đầu dừng) được **đánh dấu đỏ** và đếm trên biểu tượng tab "Lỗi".

## 8. Nhập dữ liệu cũ
Admin tải **file Excel mẫu** từ app, điền dữ liệu từ phiếu giấy rồi tải lên. App kiểm tra lỗi trước khi nhập.

## 9. Các quyết định đã chốt
- Q1 Zalo: phương án b (nút Gửi qua Zalo, bấm tay).
- Q2 GitHub: tài khoản thường, repo **Public**. File Excel và `02_seed.sql` được loại khỏi repo bằng `.gitignore`.
- Q3 Tổng sản lượng **gồm cả hàng lỗi**.
- Q4 Kỹ thuật được cập nhật tình trạng lỗi **sau khi phiếu đã khóa**.
- Q5 OEE dây chuyền theo công thức ở mục 5.
- Q6 Ca 1 06:00–14:00, Ca 2 14:00–22:00, Ca HC 07:30–16:30, nghỉ 30 phút (chỉnh được).
- Q7 Làm đủ 3 đợt trong một lần.
- Tình trạng lỗi: Chờ xử lý / Chờ vật tư / Đã xử lý / Chưa khắc phục được.
- Nhóm 6 tổn thất gán cho mã lỗi chỉ gồm nhóm 1–3. Nhóm 4–6 được tính tự động từ sản lượng. Lỗi bên ngoài máy (hết nguyên liệu, mất điện, thao tác, đầu vào không đạt…) xếp vào nhóm 3 để MTBF/MTTR chỉ tính hỏng hóc thiết bị.
- Máy chủ chặn phiếu có tổng thời gian nghỉ, dừng kế hoạch và dừng máy vượt thời gian ca.
