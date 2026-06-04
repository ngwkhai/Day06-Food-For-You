# Day06 - Food For You

Prototype chatbot gợi ý món ăn cho sinh viên quanh VinUniversity. Hệ thống gồm frontend React/Next.js, backend Express/TypeScript, mock data món ăn và tài liệu dự án.

## 1. Cấu trúc hệ thống

```text
Day06-Food-For-You/
├── frontend/   # Giao diện người dùng, màn hình deal và chatbot
├── backend/    # API xử lý prompt, constraint, recommendation
├── data/       # Mock data món ăn
├── docs/       # Tài liệu phân tích, cấu trúc, đặc tả
└── README.md   # Hướng dẫn tổng
```

Luồng chính:

```text
User → Frontend → Backend → Data/OpenAI → Backend → Frontend
```

## 2. Cách chạy prototype

### Yêu cầu

- Node.js đã cài trên máy.
- npm đi kèm Node.js.
- Trên Windows PowerShell, nếu `npm install` bị chặn bởi execution policy, dùng `npm.cmd` thay cho `npm`.

### Bước 1: Cài dependencies

Backend:

```powershell
cd backend
npm.cmd install
```

Frontend:

```powershell
cd frontend
npm.cmd install
```

### Bước 2: Cấu hình biến môi trường

Tạo file `backend/.env`:

```env
PORT=8000
DATA_FILE_PATH=../data/mock_foods.json
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=10000
```

Ghi chú:

- `OPENAI_API_KEY` dùng để backend gọi model AI.
- Nếu không có key, backend vẫn có fallback logic, nhưng chất lượng phản hồi AI sẽ hạn chế.
- Không bật `FOOD_REPOSITORY=database` vì repository database hiện chưa implement đầy đủ.

Tạo file `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Khi deploy, đổi `NEXT_PUBLIC_SITE_URL` thành domain thật.

### Bước 3: Chạy backend trước

Mở terminal 1:

```powershell
cd backend
npm.cmd run dev
```

Backend chạy tại:

```text
http://localhost:8000
```

Kiểm tra:

```text
http://localhost:8000/health
http://localhost:8000/docs
```

### Bước 4: Chạy frontend sau

Mở terminal 2:

```powershell
cd frontend
npm.cmd run dev
```

Frontend chạy tại:

```text
http://localhost:3000
```

Nếu port `3000` đang được dùng, Next.js có thể tự chuyển sang `3001`. Để quay lại `3000`, tắt process cũ theo PID mà terminal báo, ví dụ:

```powershell
taskkill /PID 12516 /F
```

Sau đó chạy lại frontend.

## 3. API chính

Frontend gọi backend qua biến:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Các endpoint chính:

```text
GET  /health
GET  /docs
POST /api/recommend
POST /api/correct
POST /api/recommend/stop
```

`POST /api/recommend` dùng để gửi prompt từ chatbot sang backend.

`POST /api/correct` dùng khi user sửa tiêu chí hoặc cập nhật yêu cầu trước đó.

`POST /api/recommend/stop` dùng để frontend báo backend dừng phản hồi đang chạy. UI vẫn dừng ngay cả khi backend chưa xử lý stop server-side.

## 4. Công cụ và API đã dùng

### Frontend

- React 19.
- Next.js 16 App Router.
- TypeScript.
- CSS thuần trong `frontend/src/styles/globals.css`.
- Next metadata để cấu hình favicon/logo web bằng `xanhsm_logo.png`.
- UI tự dựng dựa trên mockup `user_ui.jpg` và `chatbot_ui.jpg`.

Tính năng frontend:

- Màn hình chính hiển thị deal, category, brand card.
- Nút chatbot nổi có hiệu ứng 3 vòng xanh, đỏ, vàng tỏa ra.
- Màn hình chat AI.
- Gửi prompt sang backend.
- Dừng phản hồi bot trên UI và gọi API stop.
- Typewriter effect cho câu trả lời.
- Lịch sử chat và tạo new chat.
- Card gợi ý món ăn, chọn món bằng dấu cộng, chuyển sang tick xanh và hiện icon giỏ hàng.

### Backend

- Node.js.
- Express.js.
- TypeScript.
- `tsx` để chạy TypeScript trực tiếp khi dev.
- `dotenv` để đọc biến môi trường.
- `cors` để frontend gọi API.
- `zod` cho schema/validation nếu cần.
- `swagger-ui-express` cho trang tài liệu API ở `/docs`.

### AI/API

- OpenAI API.
- Model mặc định:

```env
OPENAI_MODEL=gpt-4o-mini
```

Backend dùng AI để:

- Trích xuất constraint từ prompt người dùng.
- Sinh câu trả lời tự nhiên cho chatbot.
- Kết hợp kết quả recommendation thành phản hồi dễ hiểu.

### Data

- Mock food data nằm ở:

```text
data/mock_foods.json
```

Backend mặc định đọc data qua JSON repository:

```env
DATA_FILE_PATH=../data/mock_foods.json
```

## 5. Lệnh kiểm tra

Frontend:

```powershell
cd frontend
npm.cmd run lint
npm.cmd run build
```

Backend:

```powershell
cd backend
npm.cmd run build
npm.cmd test
```

## 6. Phân công

| Nhóm việc | Người phụ trách | Nội dung |
| --- | --- | --- |
| Frontend | Huy | Xây dựng UI màn hình chính, chatbot, card món ăn, trạng thái chọn món, gọi API backend |
| Backend | Dương hoặc Khải | Xây dựng Express API, route recommend/correct/health/docs, xử lý prompt, constraint, recommendation |
| Data | Đạt | Chuẩn bị mock data món ăn, schema dữ liệu, kiểm tra dữ liệu mẫu |
| Docs/Demo | Khải + Dương | Viết tài liệu, API contract, test plan, demo script |

## 7. Ghi chú khi push/pull repo

Không push các thư mục sinh ra khi chạy local:

```text
frontend/node_modules/
frontend/.next/
backend/node_modules/
```

Các thư mục này đã được ignore trong `.gitignore`.

Người khác pull repo về chỉ cần chạy:

```powershell
cd backend
npm.cmd install
npm.cmd run dev
```

và ở terminal khác:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```
