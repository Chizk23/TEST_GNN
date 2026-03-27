# BÁO CÁO CẬP NHẬT TIẾN ĐỘ DỰ ÁN GNN-INSIGHT

## 1. Tính Năng Khả Thị Hoá (Visualization) Của 4 Tasks
Hệ thống đồ thị trực quan (Graph Visualizer) sử dụng `react-force-graph` và `d3-force` để theo dõi quá trình máy học theo thời gian thực (Real-time Epoch Streaming). Dưới đây là chi tiết khả thị cho 4 bài toán GNN trọng tâm:

1. **Task 1: Node Classification (Phân Loại Nút)**
   - **Mục tiêu trực quan:** Cho thấy quá trình mô hình GNN học cách phân lớp các node trong đồ thị.
   - **Khả thị hoá:** 
     - Quần thể Node được đổ màu tương ứng với "nhãn dự đoán" (Prediction Class). So sánh với viền ngoài hiển thị "nhãn thực tế" (Ground Truth).
     - Bắn luồng tọa độ PCA (2D Embeddings) theo từng Epoch để thấy cách các nhóm Node cùng nhãn tự hút nhau (clustering) vào các cụm riêng biệt trong quá trình tối ưu hàm Loss.

2. **Task 2: Graph Classification (Phân Loại Đồ Thị)**
   - **Mục tiêu trực quan:** Đánh giá tính chất của một *tập hợp* các đồ thị (ví dụ: các phân tử hóa học).
   - **Khả thị hoá:**
     - Tách biệt rõ ràng nhiều cụm đồ thị rời rạc (Isolated Graphs) trên cùng một không gian hiển thị.
     - Hiển thị bảng điều khiển "Graph-level" để người dùng xem nhãn phân loại của cả khối đồ thị thay vì từng hạt (node) nhỏ lẻ. Màu sắc của cả block sẽ thay đổi theo mức độ tự tin (confidence) của mô hình.

3. **Task 3: Link Prediction (Dự Đoán Liên Kết)**
   - **Mục tiêu trực quan:** Tìm và cảnh báo các mảnh ghép kết nối tiềm năng chưa tồn tại.
   - **Khả thị hoá:**
     - Vẽ thêm các đường "Nét đứt" (Dashed Edges) với hiệu ứng lan toả nhấp nháy (pulsing animated links).
     - Độ mờ (opacity) và độ dày (width) của đường ống thay đổi tỷ lệ thuận với "Xác suất kết nối" (Link Probability) mà GCA/GCN xuất ra. Mạng phân biệt rõ đâu là *Positive Edge* (đã tồn tại) và *Negative Edge* (tiềm năng).

4. **Task 4: Community Detection (Phát Hiện Cộng Đồng)**
   - **Mục tiêu trực quan:** Phân mảng mạng lưới thành các bộ phận tập trung đông nhất.
   - **Khả thị hoá:**
     - Ứng dụng thuật toán phân nhóm (Modularity Maximization / Louvain) lên toạ độ GNN nhả ra, tiến hành bọc các cụm Nodes lại bằng hình bao lồi (Convex Hull - Polygon mờ).
     - Cập nhật liên tục khối lượng Modularity Score (Q) lên biểu đồ, các vòng sáng Halo bay quanh các "Bridge Nodes" (Node cầu nối ranh giới giữa 2 cộng đồng).

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Polyglot Persistence Architecture)

Thay vì cố nhồi nhét mọi thứ vào SQL, hệ thống chọn cách tiếp cận Micro-Persistence (chia để trị) dùng **3 loại Database khác nhau**:

- **A. Hệ Quản trị CSDL Quan Hệ (MySQL):**
  - **Lưu trữ:** Metadata của Project (`Project` table), các File tập dữ liệu tải lên (`Dataset` table), và thẻ đánh dấu vĩ mô của từng lần chạy (`TrainingRun` ID, best_val_acc, created_at, task_type).
  - **Lý do chọn:** SQL hoàn hảo cho việc duy trì cấu trúc quan hệ cha - con (1 User -> N Projects -> N Datasets -> N Runs). Tính nhất quán ACID đảm bảo việc truy xuất thư viện danh sách Project cực kỳ chuẩn xác, hỗ trợ sắp xếp và phân trang dễ dàng.

- **B. Hệ Quản trị CSDL Phi Cấu Trúc (MongoDB):**
  - **Lưu trữ:** Dữ liệu Streaming cục bộ: Tọa độ X/Y của đồ họa, xác suất mảng Tensor dài ngoằng, danh sách Predictions của *từng Epoch* (Snapshots).
  - **Lý do chọn:** Dữ liệu khả thị Machine Learning có khối lượng khủng (Heavy Payload) và Schema biến đổi liên tục tùy Task (Task 1 có Predictions, Task 3 có Link Probabilities). MongoDB dạng Document dẻo (BSON) cho phép nhét nguyên mảng Array JSON nặng vài MB vào 1 Document với tốc độ Read/Write cực nhanh mà không cần rã bảng lằng nhằng như SQL.

- **C. Bộ Nhớ Đệm Tốc Độ Cao (Redis):**
  - **Lưu trữ:** Kết quả của Lần Training Tốt Nhất (Best Epoch Final Summary).
  - **Lý do chọn:** RAM thuần. Giải quyết bài toán UI/UX yêu cầu: *Khi user click "Khôi phục báo cáo (Restore)", đồ thị phải phục hồi lập tức dưới 50ms*. Thay vì chọc lại vào ổ cứng tìm ở MongoDB, Backend bốc thẳng dữ liệu nóng từ Redis ném lên Frontend, trải nghiệm replay mượt như không có độ trễ.

---

## 3. Các Lỗi Gặp Phải Vừa Qua & Cách Fix (Changelog Gần Nhất)

- **Lỗi 1: Đồ thị đứt nét, báo đỏ "Node Not Found 0" (Xong)**
  - *Hiện trạng:* Data custom tải lên bị d3-force Engine nhận nhầm ID chuỗi (string) với ID số (integer) khiến lực nối bị sập.
  - *Đã Fix:* Refactor lại bộ `user_loader.py` trên BE. Ráp cơ chế auto-mapping gán ID chuẩn mảng 0-indexed nội bộ (`_internal_id`). Khắc phục xung đột Frontend `Graph.d3Force`.
- **Lỗi 2: Train xong nhưng Thư viện Project báo "0 Runs" (Xong)**
  - *Hiện trạng:* BE có tạo record nhưng do mảng thụt lề (Indentation Bug) và đoạn if/else trỏ sai khiến biến `project_id` bị lửng lơ. Training Runs bị ném vào nhầm "Default Project" thay vì dự án của người dùng.
  - *Đã Fix:* Đồng nhất hóa Object Relation trong `main.py` và `user_loader.py`. Bắt chặt `dataset_id` truy vấn ngược lại Database gốc để tự điền `project_id`. Frontend `useWebSocket` cũng tự động `fetchProjects()` realtime làm mới UI khi train hoàn tất.
- **Lỗi 3: Nút Restore Báo Cáo lịch sử không hiển thị hình ảnh (Xong)**
  - *Hiện trạng:* Gọi tải lại nhưng màn hình tối đen. Vì Backend MongoDB chỉ lưu "Giá trị xác suất" mà lười không lưu "Khung cốt đồ thị JSON".
  - *Đã Fix:* Nâng cấp endpoint RESTful `/api/runs/{id}/restore`, backend tự động lội Database, đọc lại Data Object gốc từ ổ cứng để dịch ra `graph_json`, merge chung với xác suất lịch sử ném xuống cho React state. UI lập tức khoác áo lịch sử, tái sinh khung ảnh đồ thị.
- **Lỗi 4: Accuracy bị lạm phát 100% ảo (Xong)**
  - *Hiện trạng:* Sơ suất code chấm điểm bằng metric `overall_acc` (tính trên tập Train đã học thụt lòng) nên GNN lúc nào cũng hiện 99-100%. 
  - *Đã Fix:* Trả mọi thứ về quỹ đạo học thuật chuẩn `val_acc` (độ chính xác trên tập Validation giấu kín). Đảm bảo kết quả logic, chân thực để báo cáo hội đồng.

---

## 4. Tổng Kết Giá Trị Đã Đạt Được (What We Have Done)
- ✅ Xây dựng thành công hệ sinh thái **End-to-end GNN Platform**.
- ✅ Hỗ trợ tải dữ liệu cá nhân (`Custom CSV`) tự động chuẩn hoá Tensor.
- ✅ Stream WebSocket trực tiếp xuyên suốt từ PyTorch backend -> React frontend.
- ✅ Kiến trúc Zero-loss data: Quản lý thư viện dự án chuyên nghiệp y chang TensorBoard + Weights & Biases (MongoDB + MySQL persistance).

## 5. Hướng Phát Triển Tương Lai (Backend & Database Roadmap)
1. **Streaming Data Chunking:** Thay vì gửi toàn cục mạng qua WebSocket, chia bản đồ đồ thị khổng lồ (vài triệu node) thành các tile nhỏ hoặc chỉ gửi Delta (những điểm thay đổi tọa độ) để cực đại tốc độ render và chống tràn RAM trình duyệt.
2. **File Hashing (MD5) Optimizer:** Cài đặt hàm Băm kiểm tra dataset upload vào MySQL. Nếu 2 user upload cùng 1 file CSV, hệ thống tự động Refer Hash ID thay vì lưu trùng lặp 2 cục data nặng vào ổ cứng. Tiết kiệm Cost Storage hệ thống.
3. **Graph Database (Neo4j):** Cân nhắc tích hợp Native Graph Database (thay vì chắp vá bằng RDBMS) để cho phép query các cụm Nodes/Subgraphs tốc độ cao ở phase Inference.
