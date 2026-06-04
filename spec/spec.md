# SPEC sản phẩm - Xanh SM Ngon Lunch Chatbot

Nhóm: **Food For You**  
Track: **Food / Food delivery**  
Product/app thật: **Xanh SM Ngon trong ứng dụng Xanh SM**  
Build slice: **Chatbot hỗ trợ học viên khóa AI thực chiến tại VinUni chọn món trưa nhanh khi căng tin đông.**

SPEC này trả lời 4 câu hỏi chính:

1. Sản phẩm giải vấn đề gì và cho ai?
2. AI tham gia quyết định điều gì?
3. Chuyện gì xảy ra khi AI trả lời sai?
4. Những nhận định của nhóm dựa trên bằng chứng nào?

---

## 1. Bằng chứng

Nỗi đau chính đến từ bối cảnh ăn trưa tại VinUni: học viên khóa AI thực chiến chỉ có khoảng 1 tiếng nghỉ trưa, trong khi căng tin đông và việc đặt đồ ăn qua app vẫn yêu cầu tự lướt, tự lọc, tự đoán món nào giao kịp.

### Bằng chứng trực tiếp

| Bằng chứng | Nguồn | Điều học được | Ảnh hưởng đến SPEC |
|---|---|---|---|
| Căng tin Foodology tại VinUni đông vào giờ trưa, có hàng người đứng chờ trước quầy. | `02-group-spec/cantin_food.jpg` | Pain không chỉ là "không biết ăn gì", mà là thiếu thời gian để xếp hàng, chọn món và ăn kịp trước giờ học chiều. | Tập trung vào use case đặt bữa trưa thay thế việc xếp hàng ở căng tin. |
| Màn hình Xanh SM Ngon có nhiều món/quán, bộ lọc, khuyến mãi, ETA và giá; user vẫn phải tự lướt để quyết định. | `02-group-spec/xanhsm_ngon.jpg` | Khi đang vội, nhiều lựa chọn làm người dùng chậm quyết định. | Chatbot phải hỏi nhanh 2-3 câu rồi rút gọn thành 3 gợi ý phù hợp. |

### Bằng chứng từ ngoài nhóm

| Bằng chứng | Nguồn trong evidence pack | Điều học được |
|---|---|---|
| Xanh SM Ngon có hơn 2.000 nhà hàng đối tác tại Hà Nội khi ra mắt. | Thanh Niên / VnExpress, được ghi trong `02-group-spec/evidence-pack-template.md` | Có nhiều lựa chọn quanh người dùng, nhưng nhiều lựa chọn cũng làm quyết định khó hơn trong giờ nghỉ ngắn. |
| Dịch vụ nhấn mạnh giao nhanh, không ghép đơn, giao thẳng từ nhà hàng đến người dùng để giữ món nóng/tươi. | Green SM Food / Dân trí / VnExpress, được ghi trong evidence pack | Gợi ý món phải ưu tiên ETA, độ nóng, khả năng ăn nhanh và độ tin cậy, không chỉ ưu tiên khẩu vị. |
| Xanh SM Ngon nhấn mạnh ảnh thật, review thật, chất lượng và bảo hiểm đồ ăn. | Green SM Food / App Store merchant listing, được ghi trong evidence pack | Chatbot nên tóm tắt trust signal ngắn gọn để user không phải tự đọc nhiều card/review. |

### Phỏng vấn nhanh trong lớp

- Dương nói rằng việc tự chuẩn bị đồ ăn mang đi mất thời gian và công sức; bạn muốn có nền tảng hỗ trợ đặt đồ ăn nhanh chóng và phù hợp túi tiền.
- Huy nói khi đến căng tin, bạn quan tâm món nào ngon và hàng nào ngắn hơn để kịp ăn trong giờ trưa.

Insight:

```text
Học viên khóa AI thực chiến tại VinUni không chỉ cần danh sách món ăn hoặc khuyến mãi.
Họ cần được hỗ trợ quyết định thật nhanh món nào giao kịp, còn nóng, dễ ăn trong thời gian ngắn,
vì nếu chọn sai món/quán, họ có thể không kịp ăn hoặc vào lớp muộn.
```

## 2. Lát cắt để build

```text
Cho học viên khóa AI thực chiến tại VinUni đang có 1 tiếng nghỉ trưa và căng tin quá đông,
prototype dùng chatbot AI để hỏi 2-3 câu về thời gian còn lại, ngân sách, khẩu vị và mức độ no,
tạo ra 3 gợi ý món/quán trên Xanh SM Ngon kèm lý do chọn theo ETA, độ nóng, độ dễ ăn nhanh,
và xử lý failure mode gợi ý món giao không kịp hoặc không đúng ràng buộc bằng correction và giải thích tiêu chí gợi ý.
```

Không build toàn bộ app đặt đồ ăn. Prototype chỉ build một flow nhỏ:

- User nhập nhu cầu ăn trưa.
- AI hỏi lại nếu thiếu thông tin quan trọng.
- AI trả 3 gợi ý món/quán từ mock data 10-15 món/quán gần VinUni.
- User sửa ràng buộc, AI cập nhật gợi ý.
- User vẫn tự quyết món cuối cùng và tự đặt trên app.

## 3. AI Product Canvas

| Ô | Nội dung SPEC |
|---|---|
| **Value - Giá trị** | Sản phẩm dành cho học viên khóa AI thực chiến tại VinUni có 1 tiếng nghỉ trưa, căng tin đông, cần ăn nhanh và đúng ngân sách. AI giúp thu hẹp lựa chọn đồ ăn bằng cách hỏi đúng ràng buộc và xếp hạng món theo ETA, độ nóng, độ dễ ăn nhanh, ngân sách, khẩu vị và mức độ no. |
| **Trust - Niềm tin** | Mỗi gợi ý phải hiện lý do ngắn: ETA, giá, món nóng hay dễ ăn nhanh, rating/review hoặc trust signal. Nếu AI gợi ý sai, user có thể sửa trực tiếp như "chỉ còn 35 phút", "không ăn cay", "dưới 60k"; AI phải cập nhật danh sách và giải thích thay đổi. |
| **Feasibility - Tính khả thi** | Đáng build trong Day 06 vì scope nhỏ, có thể dùng mock data 10-15 món/quán gần VinUni thay vì tích hợp API thật. Chi phí và độ trễ mỗi lượt gọi cần thấp vì user đang vội. Rủi ro lớn nhất là AI gợi ý món giao không kịp hoặc sai ràng buộc. Nếu prototype không xử lý được correction path cho thời gian/khẩu vị/ngân sách, nhóm nên dừng mở rộng scope. |
| **Tín hiệu học** | Khi user sửa kết quả, prototype lưu lại loại sửa: thời gian còn lại, ngân sách, khẩu vị, món không muốn ăn, món giao quá lâu. Các tín hiệu này đi vào test cases/rule/prompt để cải thiện ranking và giảm lỗi trong các lần gợi ý sau. |

## 4. Tăng năng lực hay tự động hóa

Nhóm chọn **tăng năng lực (augmentation)**.

AI chỉ gợi ý, hỏi lại, phân loại ràng buộc và xếp hạng món/quán. AI không tự đặt món, không tự thanh toán, không tự chọn thay người dùng.

Vai trò của con người:

- **Decider:** user quyết định chọn món nào trong 3 gợi ý.
- **Rescuer:** user sửa lại khi AI hiểu sai bối cảnh hoặc đưa món không phù hợp.

Lý do chọn augmentation: đặt món trưa có nhiều ràng buộc cá nhân như khẩu vị, ngân sách, độ no, món cay/không cay và thời gian còn lại. Nếu AI tự đặt sai, user có thể không kịp ăn hoặc mất tiền. Vì vậy trong lát cắt này, AI chỉ nên giúp quyết định nhanh hơn, còn hành động cuối cùng thuộc về user.

## 5. Bốn đường đi của trải nghiệm

| Đường đi | Prototype phải thể hiện | Cách xử lý |
|---|---|---|
| **Đường thuận** | User nhập: "Mình có 1 tiếng nghỉ, căng tin đông, cần món nóng dưới 80k." | AI trả 3 món/quán giao kịp, kèm ETA, giá và lý do vì sao phù hợp. |
| **Khi AI không chắc** | User nhập: "Ăn gì nhanh cũng được." | AI hỏi lại tối đa 3 câu: còn bao nhiêu phút, ngân sách bao nhiêu, muốn ăn no hay ăn nhẹ. |
| **Khi AI sai** | AI gợi ý món có ETA quá lâu, món dễ nguội hoặc không đúng ngân sách/khẩu vị. | User phản hồi lỗi; prototype cho sửa tiêu chí, bỏ món sai và hiển thị lý do cập nhật. |
| **Khi người dùng sửa** | User sửa: "Chỉ còn 35 phút, không ăn cay." | AI cập nhật sang món gần hơn, dễ ăn nhanh hơn, không cay; lưu correction làm tín hiệu kiểm thử/ranking. |

## 6. Những kiểu lỗi đáng lo nhất

### Lỗi 1: Gợi ý món giao không kịp

- Khi nào xảy ra: user chỉ còn 35-45 phút nhưng AI vẫn chọn quán có ETA dài hoặc món cần chuẩn bị lâu.
- Ai chịu thiệt: học viên có thể không kịp ăn, vào lớp muộn hoặc mất niềm tin vào chatbot.
- Cách xử lý trong prototype: luôn hiện ETA, ưu tiên món/quán gần hơn, hỏi lại khi thiếu thông tin thời gian, cho user sửa "chỉ còn X phút" và rerank ngay.

### Lỗi 2: Gợi ý sai khẩu vị, ngân sách hoặc mức độ no

- Khi nào xảy ra: input mơ hồ như "ăn gì cũng được", hoặc AI bỏ qua ràng buộc "không cay", "dưới 60k", "ăn nhẹ".
- Ai chịu thiệt: user mất thời gian xem lại, phải tự lọc thủ công, hoặc đặt món không phù hợp.
- Cách xử lý trong prototype: hỏi lại tối đa 3 câu khi thiếu ràng buộc; mỗi gợi ý phải hiện tag giá, khẩu vị, mức độ no; user sửa trực tiếp để AI cập nhật.

### Lỗi 3: Gợi ý có vẻ đáng tin nhưng thiếu căn cứ

- Khi nào xảy ra: AI giải thích chung chung kiểu "món này ngon" nhưng không dựa trên ETA, giá, rating/review hoặc trust signal.
- Ai chịu thiệt: user khó kiểm chứng trong lúc vội, dễ chọn sai quán.
- Cách xử lý trong prototype: mỗi gợi ý bắt buộc có lý do ngắn theo format: ETA, giá, độ nóng/dễ ăn, trust signal. Nếu thiếu dữ liệu, AI phải nói rõ là chưa đủ chắc và hỏi lại hoặc đưa fallback.

## 7. Kế hoạch kiểm thử và bằng chứng demo

### Test case 1 - Đường thuận

Input:

```text
Mình có 1 tiếng nghỉ, căng tin đông, muốn món nóng dưới 80k, ăn no vừa.
```

Kỳ vọng:

- AI trả 3 gợi ý món/quán.
- Mỗi gợi ý có ETA, giá, lý do chọn và trust signal.
- Không gợi ý món vượt ngân sách hoặc ETA quá lâu.

### Test case 2 - Đầu vào mơ hồ / low-confidence

Input:

```text
Ăn gì nhanh cũng được.
```

Kỳ vọng:

- AI không đoán bừa.
- AI hỏi lại tối đa 3 câu: còn bao nhiêu phút, ngân sách, ăn no hay ăn nhẹ.

### Test case 3 - Failure và correction

Input ban đầu:

```text
Mình muốn ăn phở, còn khoảng 45 phút.
```

Correction:

```text
Thực ra chỉ còn 35 phút, không ăn cay, dưới 60k.
```

Kỳ vọng:

- AI bỏ các món/quán có ETA không phù hợp.
- AI cập nhật sang món gần hơn, dễ ăn hơn, không cay, dưới 60k.
- AI giải thích ngắn vì sao danh sách thay đổi.

### Bằng chứng demo cần giữ

- Ảnh `02-group-spec/cantin_food.jpg` cho thấy bối cảnh căng tin đông.
- Ảnh `02-group-spec/xanhsm_ngon.jpg` cho thấy user phải tự lọc nhiều món/quán.
- Nhật ký prompt cho 3 test case trên.
- Ghi chú correction path: user sửa thời gian/ngân sách/khẩu vị thì ranking đổi thế nào.

## 8. Phân công

| Thành viên | Phần phụ trách | Output cần có |
|---|---|---|
| Huy, Khải | Xây dựng flow chatbot: màn hình nhập nhu cầu, câu hỏi làm rõ, màn hình trả 3 gợi ý món/quán. | Prototype chạy được happy path và low-confidence path. |
| Đạt | Chuẩn bị mock data món/quán gần VinUni: tên món, giá, ETA, mức độ no, độ nóng, tag khẩu vị, trust signal. | File/mock data 10-15 món/quán dùng được cho prototype. |
| Đạt | Viết logic gợi ý và correction: lọc theo thời gian còn lại, ngân sách, khẩu vị, món nóng/dễ ăn nhanh. | Rule/prompt gợi ý món và flow cập nhật kết quả khi user sửa tiêu chí. |
| Dương, Khải | Test prototype và chuẩn bị demo: happy, low-confidence, failure, correction. | Ghi chú test 4 paths, case failure AI gợi ý món giao không kịp, demo script 3-5 phút. |

| Nhóm việc | Người phụ trách | Nội dung |
| --- | --- | --- |
| Frontend | Dương, Đạt | Xây dựng UI màn hình chính, chatbot, card món ăn, trạng thái chọn món, gọi API backend |
| Backend | Huy, Khải | Xây dựng Express API, route recommend/correct/health/docs, xử lý prompt, constraint, recommendation |
| Data | Huy, Khải | Chuẩn bị mock data món ăn, schema dữ liệu, kiểm tra dữ liệu mẫu |
| Docs/Demo | Dương, Đạt | Viết tài liệu, API contract, test plan, demo script |

## Backlog không build trong Day 06

- Tích hợp API thật của Xanh SM Ngon.
- Thanh toán, tracking shipper, voucher thật.
- Cá nhân hóa dài hạn theo lịch sử đặt món.
- Tối ưu đặt theo nhóm/lớp hoặc gom đơn nhiều học viên.
- Dự đoán thời gian chuẩn bị món theo dữ liệu real-time của nhà hàng.
