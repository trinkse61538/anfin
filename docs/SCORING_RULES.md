# Media Scoring Rules

Các ngưỡng được cấu hình tại `assets/js/config.js`.

## Metric set

- Spend
- Impressions
- Clicks
- CTR
- Average CPC
- Average CPM
- Interactions / Interaction Rate
- Engagements / Engagement Rate
- Invalid Clicks / Invalid Click Rate
- Search Impression Share / Lost IS khi có dữ liệu Search
- PMax Ad Strength

## Yêu cầu volume

Một nhóm chỉ được kết luận mạnh khi đạt đồng thời:

- ít nhất 1.000 impressions;
- ít nhất 30 clicks.

Nhóm chưa đủ volume nhận score trung tính và trạng thái `Chưa đủ volume`.

## Benchmark

1. Campaign được so với các campaign cùng `Campaign Type` nếu có từ hai peer trở lên.
2. Ad Group/Ad được so trong campaign tương ứng.
3. Nếu không có đủ peer, report dùng benchmark toàn tài khoản.
4. Mỗi kỳ được so với khoảng thời gian liền trước có cùng số ngày.

## Tín hiệu cộng điểm

- CTR cao hơn benchmark ít nhất 15%.
- CPC thấp hơn benchmark ít nhất 15%.
- CTR tăng ít nhất 20% so với kỳ trước.
- CPC giảm ít nhất 20% so với kỳ trước.
- PMax Ad Strength ở mức Good hoặc Excellent.

## Tín hiệu trừ điểm

- CTR thấp hơn 70% benchmark.
- CPC cao hơn 135% benchmark.
- CTR giảm hoặc CPC tăng từ 20% so với kỳ trước.
- Spend tăng trên 20% nhưng clicks giảm.
- Invalid Click Rate từ 5%.
- PMax Ad Strength ở mức Poor hoặc Incomplete.

## Mức score

| Score | Trạng thái |
|---|---|
| 78–100 | Media tốt |
| 58–77 | Ổn định |
| 42–57 | Cần chỉnh |
| 0–41 | Ưu tiên xử lý |

## Nguyên tắc điều chỉnh

- Chỉ thay một nhóm yếu tố mỗi lần để đọc được tác động.
- Không mở rộng spend khi CPC đang tăng đồng thời CTR giảm.
- Với PMax, bổ sung độ đa dạng asset và hướng tới Good/Excellent; tránh thay toàn bộ asset cùng lúc.
- Campaign mạnh được dùng làm nguồn hypothesis cho creative/audience test, không tự động được tăng spend.
- Quan sát ít nhất một chu kỳ dữ liệu sau thay đổi trước khi chỉnh tiếp.

