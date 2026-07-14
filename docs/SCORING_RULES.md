# Scoring & Recommendation Rules

Các ngưỡng có thể chỉnh trong `assets/js/config.js`.

## Nguyên tắc

1. **Plan là chuẩn so sánh.** Nếu `04_Plan` vẫn là dòng mẫu, report không tự bịa mục tiêu.
2. **Actual Leads khác Ads Conversions.** Conversions có thể là cài app, engagement hoặc sự kiện mềm.
3. **Không quyết định từ volume nhỏ.** Mặc định cần ít nhất 30 clicks và 3 conversions để đánh giá CPL mạnh.
4. **Tracking đứng trước tối ưu media.** Khi conversion goal sai, Smart Bidding có thể tối ưu sai hành động.
5. **Scale theo bước.** Khuyến nghị tăng 10–15% chỉ xuất hiện sau khi có đủ volume và chất lượng kết quả được xác minh.

## Mức đánh giá CPL

| Trạng thái | Quy tắc mặc định |
|---|---|
| Tốt | CPL ≤ 100% Target CPL và có ≥ 3 conversions |
| Theo dõi | CPL > 120% Target CPL |
| Hành động | CPL > 150% Target CPL hoặc đã chi ≥ 1 Target CPL nhưng 0 conversion |

Nếu chưa có Target CPL, report chỉ so sánh tương đối với CPL trung bình tài khoản.

## Pacing ngân sách

Plan được phân bổ theo tỷ lệ số ngày giao với kỳ đang xem.

| Trạng thái | Spend / Planned Budget của kỳ |
|---|---|
| Bám kế hoạch | 80%–115% |
| Under-pacing | < 80% |
| Over-pacing | > 115% |

Under-pacing không tự động dẫn đến tăng ngân sách. Report yêu cầu kiểm tra CPL, Actual Leads và tracking trước.

## Conversion quality

- `DOWNLOAD`, `ENGAGEMENT`, `PAGE_VIEW`, `DEFAULT`, `OTHER` được xem là tín hiệu mềm.
- Nếu ≥ 60% conversions thuộc nhóm mềm, report đề nghị audit Primary/Secondary goals.
- Nếu Conversion Value quá thấp so với Cost, ROAS bị đánh dấu chưa đáng tin cậy.

## Impression Share

- Lost IS Budget ≥ 20%: theo dõi giới hạn ngân sách; chỉ tăng nếu hiệu quả đạt target.
- Lost IS Rank ≥ 30%: kiểm tra Ad Rank, mức liên quan, asset/creative, landing và bid.

## Điểm sức khỏe

Điểm bắt đầu từ 100 và bị trừ theo rủi ro:

- thiếu Plan;
- thiếu Actual Leads;
- dữ liệu chậm cập nhật;
- conversion chủ yếu là tín hiệu mềm;
- thiếu conversion value;
- tỷ trọng chi tiêu vào campaign không có kết quả;
- pacing hoặc lead attainment lệch lớn.

Điểm không thay thế phán đoán của người vận hành; mục đích là sắp xếp vấn đề nào cần kiểm tra trước.

