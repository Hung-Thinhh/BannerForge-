# Đặc tả chi tiết ứng dụng tạo banner sản phẩm bằng Next.js

## Mục tiêu dự án

Ứng dụng này là một web app self-hosted dùng để tạo banner sản phẩm hàng loạt từ một mẫu bố cục duy nhất. Người dùng tạo dự án, tải ảnh khung/banner lên, tải danh sách ảnh sản phẩm lên, kéo thả vị trí hiển thị trên một sản phẩm demo, cấu hình quy tắc đặt tên file chuẩn SEO, rồi xuất toàn bộ ảnh thành file ZIP để tải về. Toàn bộ quy trình có thể triển khai trên hạ tầng riêng mà không cần lưu file trên dịch vụ bên thứ ba.[1][2]

Mô hình triển khai phù hợp nhất là Next.js chạy server đầy đủ, kết hợp engine xử lý ảnh phía backend. Next.js phù hợp để xây dựng giao diện editor, API nội bộ, auth, job management và download flow trong cùng một codebase; còn xử lý ảnh hàng loạt nên dùng Node.js với Sharp vì Sharp hỗ trợ resize, crop, composite và xuất file hiệu quả.[3][1]

## Phạm vi chức năng

### Luồng sử dụng chính

1. Tạo dự án mới.
2. Tải ảnh khung hoặc background banner lên.
3. Tải danh sách ảnh sản phẩm lên, có thể theo từng file hoặc theo danh sách dữ liệu sản phẩm.
4. Chọn một sản phẩm demo để căn chỉnh.
5. Kéo thả vị trí ảnh sản phẩm, khung, logo, badge, text, giá hoặc các lớp khác trên canvas.
6. Cấu hình tên file SEO theo quy tắc slug.
7. Bấm xuất hàng loạt.
8. Tải file ZIP kết quả về máy.
9. Hệ thống tự xóa file tạm sau khi tải xong hoặc sau thời gian hết hạn.

### Tính năng người dùng

- Quản lý dự án: tạo, đổi tên, xóa, sao chép template dự án.
- Upload asset: ảnh khung, logo, icon, background, font tùy chọn.
- Upload sản phẩm: một ảnh hoặc nhiều ảnh cùng lúc.
- Editor kéo thả: di chuyển, scale, rotate, canh giữa, layer order, khóa layer, bật/tắt layer.
- Chọn một sản phẩm demo để xem preview thật.
- Batch export: render toàn bộ ảnh sản phẩm theo template đã chốt.
- Tự sinh tên file chuẩn SEO.
- Tải về theo từng ảnh hoặc tải ZIP toàn bộ.
- Không lưu file lâu dài ngoài nhu cầu xử lý job nội bộ.

## Trải nghiệm người dùng

Editor nên dùng Fabric.js vì thư viện này phù hợp cho mô hình object-based canvas editor trong Next.js, hỗ trợ kéo thả, transform và serialize trạng thái canvas khá thuận tiện cho nhu cầu lưu template.[4]

Màn hình nên chia thành 4 khu vực rõ ràng:
- Sidebar trái: danh sách layer và asset.
- Canvas giữa: vùng thiết kế banner.
- Sidebar phải: panel chỉnh thuộc tính object đang chọn.
- Thanh trên: tên dự án, chọn sản phẩm demo, nút lưu template, nút xuất hàng loạt.

Các thao tác chính cần có:
- Chọn ảnh demo khác để xem template có bị lệch bố cục hay không.
- Chế độ snap theo cạnh và theo tâm để căn chỉnh nhanh.
- Hiển thị safe area và bleed area nếu cần xuất cho nhiều nền tảng.
- Preview tên file SEO trước khi export.

## Kiến trúc kỹ thuật

### Kiến trúc tổng thể

Ứng dụng nên theo mô hình client-server trong một dự án Next.js duy nhất:

- Frontend Next.js App Router: giao diện quản lý dự án và editor.
- API layer trong Next.js: upload file, lưu metadata, tạo export job, phát link tải nội bộ.
- Render worker nội bộ: xử lý hàng loạt ảnh bằng Sharp.
- Temporary storage: thư mục tạm trên local disk hoặc volume Docker.
- Database: lưu project, template, metadata file, job, quy tắc SEO filename.
- Queue: dùng Redis/BullMQ nếu số lượng ảnh lớn hoặc cần export nền để không block request.[5]

### Tại sao không dùng static export

Next.js có lưu ý rằng tính năng tối ưu ảnh mặc định cần runtime hỗ trợ từ server, nên app này không nên thiết kế như một static export thuần. Với bài toán upload, render, queue và tải ZIP nội bộ, mô hình server-rendered hoặc hybrid server app là phù hợp hơn.[3][6]

## Cấu trúc module đề xuất

```text
apps/banner-generator/
├── app/
│   ├── (dashboard)/
│   │   ├── projects/
│   │   ├── editor/[projectId]/
│   │   ├── exports/[jobId]/
│   │   └── settings/
│   ├── api/
│   │   ├── projects/
│   │   ├── uploads/
│   │   ├── templates/
│   │   ├── jobs/
│   │   └── downloads/
│   └── layout.tsx
├── components/
│   ├── editor/
│   ├── project/
│   ├── upload/
│   ├── export/
│   └── seo/
├── lib/
│   ├── db/
│   ├── storage/
│   ├── renderer/
│   ├── queue/
│   ├── seo/
│   └── validation/
├── workers/
│   └── export-worker.ts
├── prisma/
│   └── schema.prisma
├── tmp/
│   ├── uploads/
│   ├── jobs/
│   └── exports/
└── docker/
```

## Quy trình nghiệp vụ chi tiết

### 1. Tạo dự án

Người dùng tạo dự án với các trường cơ bản:
- Tên dự án.
- Kích thước canvas mặc định, ví dụ 1200x1200.
- Nền tảng đích, ví dụ Shopee, TikTok Shop, web catalog.
- Chuẩn xuất mặc định, ví dụ JPEG chất lượng cao hoặc WebP.
- Rule tên file SEO mặc định.

Khi tạo xong, hệ thống sinh `projectId`, thư mục tạm riêng và bản template rỗng ban đầu.

### 2. Upload ảnh khung

Người dùng tải lên ảnh khung hoặc background làm nền banner. Asset này có thể là PNG nền trong suốt, JPEG background, hoặc nhiều lớp riêng như logo, nhãn giảm giá, sticker.

Yêu cầu xử lý:
- Kiểm tra mime type.
- Chuẩn hóa tên file nội bộ.
- Đọc metadata kích thước.
- Lưu vào thư mục riêng của project.
- Ghi nhận vào bảng `assets`.

### 3. Upload danh sách ảnh sản phẩm

Danh sách sản phẩm có thể đi theo 2 kiểu:
- Chỉ gồm nhiều ảnh sản phẩm.
- Gồm dữ liệu cấu trúc như: tên sản phẩm, slug SEO, giá, ảnh chính, badge, danh mục.

Ở giai đoạn MVP, có thể hỗ trợ tối thiểu:
- Upload nhiều ảnh.
- Hệ thống tự lấy tên file làm tên sản phẩm tạm.
- Cho phép sửa hàng loạt hoặc import CSV để bổ sung tên SEO.

### 4. Chọn sản phẩm demo

Người dùng chọn một sản phẩm bất kỳ làm mẫu căn chỉnh. Đây là bước quan trọng vì template phải được thử trên dữ liệu thực thay vì dữ liệu giả. Khi đổi sản phẩm demo, canvas chỉ thay dữ liệu binding chứ không làm mất cấu trúc template.

### 5. Kéo thả bố cục

Người dùng thao tác trên canvas để xác định:
- Vị trí ảnh sản phẩm.
- Kích thước vùng ảnh sản phẩm.
- Cách crop: contain, cover, fixed ratio.
- Vị trí logo, khung, badge, text.
- Font, cỡ chữ, màu chữ, letter spacing.
- Layer order và opacity.

Template lưu ở dạng JSON thay vì lưu ảnh preview đơn thuần. Đây là điểm giúp hệ thống tái render hàng loạt ở backend với chất lượng ổn định hơn screenshot canvas trên trình duyệt.[4][1]

## Thiết kế template JSON

```json
{
  "version": 1,
  "canvas": {
    "width": 1200,
    "height": 1200,
    "background": "asset://bg/main.png"
  },
  "layers": [
    {
      "id": "product-slot",
      "type": "image-slot",
      "bind": "product.image",
      "x": 160,
      "y": 180,
      "width": 880,
      "height": 760,
      "fit": "contain",
      "rotation": 0,
      "zIndex": 2,
      "locked": false
    },
    {
      "id": "frame-overlay",
      "type": "asset-image",
      "src": "asset://frame/main-frame.png",
      "x": 0,
      "y": 0,
      "width": 1200,
      "height": 1200,
      "zIndex": 10,
      "locked": true
    },
    {
      "id": "title-text",
      "type": "text",
      "bind": "product.name",
      "x": 80,
      "y": 980,
      "width": 1040,
      "fontFamily": "Be Vietnam Pro",
      "fontSize": 44,
      "fontWeight": 700,
      "color": "#111111",
      "align": "center",
      "zIndex": 11
    }
  ],
  "filenameRule": {
    "pattern": "{brand}-{productSlug}-khung-shopee",
    "extension": "webp"
  }
}
```

## Render engine

Backend render không nên phụ thuộc vào ảnh preview từ frontend mà nên dựng lại ảnh đầu ra từ template JSON. Sharp phù hợp cho bước này vì có thể đọc ảnh, resize, crop, composite nhiều lớp, và xuất thành JPEG, PNG hoặc WebP khá hiệu quả.[1][2]

Luồng render cho từng sản phẩm:
1. Đọc template JSON.
2. Tải asset nền và overlay.
3. Đọc ảnh sản phẩm của item hiện tại.
4. Áp rule fit vào `image-slot`.
5. Render text bằng SVG rồi composite vào ảnh cuối.
6. Xuất file theo định dạng đã chọn.
7. Đặt tên file theo SEO slug.
8. Ghi file vào thư mục job.

## Chất lượng ảnh đầu ra

Chất lượng đầu ra phụ thuộc vào kích thước canvas gốc, độ lớn ảnh đầu vào, rule crop/resize và format xuất. Sharp là thư viện phù hợp cho xử lý ảnh phía server vì có khả năng resize và tối ưu ảnh hiệu quả trong môi trường Node.js.[1]

Chuẩn chất lượng nên chia thành 3 mức:

| Mức xuất | Định dạng | Mục đích |
|---|---|---|
| Standard | JPEG/WebP | Dùng cho sàn thương mại điện tử |
| Optimized | WebP | Dùng cho website, nhẹ hơn |
| Master | PNG/JPEG chất lượng cao | Dùng để lưu bản gốc xuất lại |

Khuyến nghị kỹ thuật:
- Canvas đích nên đúng ngay từ đầu, ví dụ 1200x1200 hoặc 1600x1600.
- Không cho upscale vượt mức với ảnh sản phẩm quá nhỏ.
- Text nên render lại từ dữ liệu chứ không chụp màn hình canvas để tránh mờ chữ.
- Nên có preview cảnh báo khi ảnh nguồn nhỏ hơn vùng hiển thị yêu cầu.

## Quy tắc đặt tên file SEO

Google khuyến nghị tên ảnh nên mô tả rõ nội dung, tránh các tên chung chung như `IMG00023.JPG`, và dùng tên có nghĩa để giúp máy tìm kiếm hiểu nội dung ảnh tốt hơn.[7]

Ứng dụng nên hỗ trợ bộ quy tắc như sau:
- Chuyển về chữ thường.
- Bỏ dấu tiếng Việt.
- Dùng dấu gạch ngang thay cho khoảng trắng.
- Loại bỏ ký tự đặc biệt.
- Giới hạn độ dài slug.
- Không trùng file trong cùng một lần export.

Mẫu pattern đề xuất:

```text
{brand}-{productSlug}-{campaign}
{productSlug}-khung-shopee
{category}-{productSlug}-{color}
```

Ví dụ:
- `ao-thun-nam-form-rong-trang-khung-shopee.webp`
- `binh-giu-nhiet-locknlock-500ml-den.webp`
- `op-lung-iphone-15-trong-suot-sale-6-6.jpg`

## Cấu trúc database đề xuất

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  projects  Project[]
}

model Project {
  id              String      @id @default(cuid())
  userId          String
  name            String
  canvasWidth     Int
  canvasHeight    Int
  outputFormat    String
  filenamePattern String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  user            User        @relation(fields: [userId], references: [id])
  assets          Asset[]
  products        Product[]
  templates       Template[]
  jobs            ExportJob[]
}

model Asset {
  id         String   @id @default(cuid())
  projectId  String
  kind       String
  name       String
  path       String
  mimeType   String
  width      Int?
  height     Int?
  createdAt  DateTime @default(now())
  project    Project  @relation(fields: [projectId], references: [id])
}

model Product {
  id          String   @id @default(cuid())
  projectId   String
  name        String
  slug        String?
  imagePath   String
  brand       String?
  category    String?
  color       String?
  metadata    Json?
  createdAt   DateTime @default(now())
  project     Project  @relation(fields: [projectId], references: [id])
}

model Template {
  id         String   @id @default(cuid())
  projectId  String
  name       String
  schema     Json
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  project    Project  @relation(fields: [projectId], references: [id])
}

model ExportJob {
  id           String   @id @default(cuid())
  projectId    String
  templateId   String
  status       String
  totalItems   Int
  doneItems    Int      @default(0)
  zipPath      String?
  expiresAt    DateTime?
  createdAt    DateTime @default(now())
  project      Project  @relation(fields: [projectId], references: [id])
}
```

## API đề xuất

### Project API
- `POST /api/projects` tạo dự án.
- `GET /api/projects/:id` lấy chi tiết dự án.
- `PATCH /api/projects/:id` cập nhật dự án.
- `DELETE /api/projects/:id` xóa dự án và file tạm liên quan.

### Asset API
- `POST /api/uploads/frame` upload ảnh khung.
- `POST /api/uploads/product-images` upload danh sách ảnh sản phẩm.
- `POST /api/uploads/csv` import metadata sản phẩm.

### Template API
- `POST /api/templates/:projectId` lưu template JSON.
- `GET /api/templates/:projectId/active` lấy template đang dùng.

### Job API
- `POST /api/jobs/export` tạo job xuất hàng loạt.
- `GET /api/jobs/:jobId` xem tiến độ.
- `GET /api/downloads/:jobId` tải ZIP.
- `DELETE /api/jobs/:jobId` xóa job thủ công.

## Hệ thống hàng đợi và xử lý nền

Nếu mỗi lần export chỉ vài chục ảnh thì có thể xử lý đồng bộ theo request nội bộ. Nhưng khi số lượng tăng lên vài trăm hoặc hàng nghìn ảnh, nên tách job queue bằng Redis và BullMQ để tránh timeout và để theo dõi tiến độ tốt hơn.[5]

Cấu trúc queue đề xuất:
- `export:create`: nhận yêu cầu xuất mới.
- `export:render-item`: render từng ảnh sản phẩm.
- `export:zip`: đóng gói thành ZIP.
- `export:cleanup`: xóa file tạm sau TTL.

## Chính sách lưu trữ nội bộ

Yêu cầu “chỉ tải về thôi, không lưu bên thứ ba” nên được áp dụng theo nguyên tắc sau:
- Không upload sang Cloudinary, S3 public hoặc bất kỳ storage bên ngoài nào.
- Chỉ lưu trên local disk hoặc volume private của server.
- File render và ZIP chỉ tồn tại tạm thời.
- Sau khi tải xong hoặc hết thời gian hiệu lực, hệ thống tự xóa.
- Nếu cần audit, chỉ lưu metadata job chứ không lưu file ảnh thật lâu dài.[5]

Cấu trúc lưu trữ:

```text
tmp/
├── uploads/{projectId}/
├── jobs/{jobId}/renders/
├── exports/{jobId}.zip
└── cleanup-locks/
```

## Bảo mật và kiểm soát file

- Giới hạn loại file upload: PNG, JPEG, WebP, SVG an toàn, CSV.
- Chặn file giả mạo mime type.
- Giới hạn dung lượng và số lượng ảnh mỗi batch.
- Scan tên file đầu vào trước khi ghi đĩa.
- Không cho truy cập trực tiếp thư mục `tmp` qua web server.
- Download phải qua API có kiểm tra quyền hoặc token ngắn hạn.
- Tự động xóa đường dẫn tải sau khi hết hạn.

## Giao diện màn hình đề xuất

### 1. Danh sách dự án
- Card dự án.
- Nút tạo mới.
- Bộ lọc theo ngày cập nhật.
- Menu thao tác: đổi tên, nhân bản, xóa.

### 2. Màn hình upload dữ liệu
- Khu upload ảnh khung.
- Khu upload ảnh sản phẩm.
- Khu import CSV metadata.
- Bảng xem trước danh sách sản phẩm.

### 3. Màn hình editor
- Canvas chính.
- Thanh công cụ căn chỉnh.
- Danh sách layer.
- Thuộc tính object.
- Chọn sản phẩm demo.
- Nút lưu template.
- Nút xem preview filename SEO.

### 4. Màn hình export
- Chọn template đang hoạt động.
- Chọn format xuất.
- Chọn pattern tên file.
- Nút xuất toàn bộ.
- Progress bar.
- Nút tải ZIP.

## Luồng export chi tiết

1. Người dùng bấm “Xuất toàn bộ”.
2. API kiểm tra template đang hoạt động và danh sách sản phẩm.
3. Hệ thống tạo `jobId`.
4. Queue bắt đầu render từng sản phẩm theo template JSON.
5. Mỗi ảnh xuất xong được lưu tạm vào thư mục render của job.
6. Sau khi hoàn tất, hệ thống đóng gói ZIP.
7. API trả trạng thái hoàn tất và tạo download token.
8. Người dùng bấm tải về.
9. Sau khi tải xong hoặc quá hạn, cron job dọn dẹp.

## MVP đề xuất

Phiên bản đầu tiên nên tập trung vào các chức năng cốt lõi nhất:
- Đăng nhập nội bộ.
- Tạo dự án.
- Upload 1 ảnh khung.
- Upload nhiều ảnh sản phẩm.
- Chọn 1 sản phẩm demo.
- Editor kéo thả 1 image slot + 1 text layer + 1 overlay frame.
- Cấu hình rule filename SEO.
- Export toàn bộ thành ZIP.
- Tự xóa file tạm.

Những gì có thể để phase 2:
- Nhiều template trong 1 dự án.
- Nhiều image slot.
- Nhiều biến dữ liệu như giá, badge, flash sale.
- Team collaboration.
- Phiên bản lịch sử template.
- Watermark rules.
- Preset cho từng sàn thương mại điện tử.

## Công nghệ khuyến nghị

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js App Router |
| Editor canvas | Fabric.js |
| Backend API | Next.js Route Handlers |
| Image rendering | Sharp |
| Database | PostgreSQL |
| ORM | Prisma |
| Queue | Redis + BullMQ |
| Auth | NextAuth hoặc auth nội bộ |
| Deploy | Docker Compose hoặc Dokploy |

Kiến trúc này phù hợp với thói quen self-host, Docker và Next.js của môi trường phát triển hiện đại, đồng thời tách được phần editor, queue và render để mở rộng về sau.[5]

## Định hướng triển khai production

Giai đoạn triển khai thực tế nên đi theo thứ tự:
1. Dựng project Next.js, Prisma, PostgreSQL.
2. Hoàn thiện module project và upload.
3. Tạo editor bằng Fabric.js với khả năng serialize template.[4]
4. Viết render engine bằng Sharp.[1][2]
5. Tạo flow export ZIP.
6. Thêm queue và cleanup cron.
7. Tối ưu UX cho preview và filename SEO.
8. Đóng gói Docker để self-host.

## Kết luận kỹ thuật

Giải pháp phù hợp nhất cho yêu cầu này là một web app Next.js self-hosted, trong đó editor chạy trên client bằng Fabric.js, còn quá trình render hàng loạt chạy trên backend bằng Sharp. Thiết kế theo hướng template JSON + batch rendering + temporary local storage sẽ đáp ứng đúng luồng “tạo dự án → upload khung → upload list ảnh sản phẩm → kéo thả demo → đặt tên SEO → xuất toàn bộ → tải về” mà vẫn giữ được chất lượng ảnh đầu ra ổn định và không phụ thuộc dịch vụ lưu trữ bên thứ ba.[3][4][1][2]