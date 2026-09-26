// src/lib/services/seed-data.ts
// Dữ liệu mẫu port NGUYÊN VĂN từ prototype (`SEED0()` / `SEED()`),
// docs/reference/So Lam Sang.dc.html dòng 690-748. Khối 14 `mk({…})` bên dưới
// được trích bằng `sed -n '703,736p'` — KHÔNG gõ lại, KHÔNG định dạng lại.
import type { Note, NoteVersion, Priority, Question, Quiz } from '@/lib/types';

const DAY = 864e5;

/** Mốc thời gian tương đối tính từ lúc seed — như prototype. */
const iso = (d: number): string => new Date(Date.now() - d * DAY).toISOString();

const sec = (h: string, b: string | string[]): string =>
  `<h2>${h}</h2>` +
  (Array.isArray(b) ? `<ul>${b.map((x) => `<li>${x}</li>`).join('')}</ul>` : `<p>${b}</p>`);

const VNOTES = [
  'Tạo ghi chú',
  'Bổ sung phần điều trị',
  'Cập nhật theo khuyến cáo mới',
  'Rà soát liều',
];

interface MkInput {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  p: Priority;
  fav?: number;
  d: number;
  v?: number;
  imgs?: string[];
  cm?: [string, number][];
  content: string;
}

/** Sinh versions từ nội dung — port nguyên văn `mk()` của prototype. */
function mk(o: MkInput): Note {
  const k = o.v || 1;
  const parts = o.content.split(/(?=<h2>)/);
  const versions: NoteVersion[] = [];
  for (let i = 1; i <= k; i++) {
    const cut = i === k ? parts.length : Math.max(1, Math.ceil((parts.length * i) / (k + 0.5)));
    versions.push({
      v: i,
      date: iso(o.d + (k - i) * 7),
      note: VNOTES[i - 1] || 'Cập nhật',
      title: o.title,
      content: parts.slice(0, cut).join(''),
    });
  }
  return {
    id: o.id,
    title: o.title,
    desc: o.desc,
    tags: o.tags,
    priority: o.p,
    fav: !!o.fav,
    created: iso(o.d + (k - 1) * 7),
    updated: iso(o.d),
    content: o.content,
    images: (o.imgs || []).map((l, i) => ({ id: o.id + 'i' + i, label: l, src: '' })),
    comments: (o.cm || []).map((c, i) => ({ id: o.id + 'c' + i, text: c[0], date: iso(c[1]) })),
    versions,
    quizzes: [],
  };
}

export function SEED0(): Note[] {
  return [
    // ── BEGIN verbatim block: prototype lines 703-736 ────────────────────
    mk({ id: 'n1', title: 'Phác đồ điều trị tăng huyết áp ở người lớn', desc: 'Ngưỡng chẩn đoán, mục tiêu huyết áp và trình tự lựa chọn thuốc theo khuyến cáo ESC/ESH.', tags: ['Tim mạch', 'Phác đồ'], p: 'high', fav: 1, d: 0.2, v: 3,
      imgs: ['Sơ đồ bậc điều trị', 'Bảng liều thuốc hạ áp'], cm: [['Lưu ý bệnh nhân cao tuổi dễ hạ áp tư thế khi phối hợp lợi tiểu — đo HA đứng.', 2], ['Viên phối hợp perindopril/amlodipin đang có tại khoa dược.', 0.5]],
      content: sec('Ngưỡng chẩn đoán', 'Tăng huyết áp khi HA đo tại phòng khám <strong>≥ 140/90 mmHg</strong>, lặp lại ở ít nhất 2 lần khám. Nên xác nhận bằng đo ngoài phòng khám:') + '<ul><li>HA tại nhà trung bình ≥ 135/85 mmHg</li><li>Holter 24 giờ trung bình ≥ 130/80 mmHg</li></ul>' +
        sec('Mục tiêu điều trị', 'Với đa số bệnh nhân, mục tiêu <strong>&lt; 130/80 mmHg</strong> nếu dung nạp tốt. Người ≥ 80 tuổi hoặc suy yếu: cá thể hoá, chấp nhận 140–150 mmHg tâm thu.') +
        '<h2>Lựa chọn thuốc khởi đầu</h2><ol><li>Phối hợp hai thuốc liều thấp: ACEi/ARB + chẹn kênh canxi hoặc lợi tiểu thiazide-like.</li><li>Chưa đạt mục tiêu: tăng lên liều đầy đủ.</li><li>Ba thuốc: ACEi/ARB + CCB + lợi tiểu.</li><li>Tăng huyết áp kháng trị: thêm spironolacton 25–50 mg.</li></ol><blockquote>Ưu tiên viên phối hợp liều cố định để cải thiện tuân thủ.</blockquote>' +
        '<h2>Lưu ý</h2><ul><li>Không phối hợp ACEi với ARB.</li><li>Kiểm tra creatinin và kali 2–4 tuần sau khởi trị ACEi/ARB.</li><li>Chẹn beta ưu tiên khi có đau thắt ngực, sau nhồi máu, suy tim hoặc cần kiểm soát tần số.</li></ul>' }),
    mk({ id: 'n2', title: 'Xử trí cấp cứu sốc phản vệ', desc: 'Adrenalin tiêm bắp là ưu tiên số một — liều, vị trí tiêm và các bước tiếp theo.', tags: ['Cấp cứu', 'Dị ứng'], p: 'high', fav: 1, d: 3, v: 2, imgs: ['Vị trí tiêm mặt trước ngoài đùi'], cm: [['Nhớ: không trì hoãn adrenalin để chờ lập đường truyền.', 3]],
      content: sec('Nhận diện', ['Khởi phát đột ngột sau tiếp xúc dị nguyên (phút đến vài giờ).', 'Tổn thương da/niêm mạc kèm khó thở, tụt huyết áp hoặc triệu chứng tiêu hoá nặng.', 'Tụt HA đơn độc sau tiếp xúc dị nguyên đã biết cũng đủ chẩn đoán.']) +
        '<h2>Xử trí ngay</h2><ol><li>Ngừng tiếp xúc dị nguyên, gọi hỗ trợ.</li><li><strong>Adrenalin 1 mg/ml tiêm bắp</strong> mặt trước ngoài đùi: người lớn 0,5 mg; trẻ em 0,01 mg/kg (tối đa 0,5 mg).</li><li>Lặp lại sau 5 phút nếu không cải thiện.</li><li>Nằm ngửa, kê cao chân; thở oxy.</li><li>Truyền nhanh NaCl 0,9% 500–1000 ml nếu tụt HA.</li></ol>' +
        sec('Theo dõi', 'Theo dõi tối thiểu 6–12 giờ vì nguy cơ phản ứng pha hai. Kê bút adrenalin tự tiêm và hướng dẫn trước khi ra viện.') }),
    mk({ id: 'n3', title: 'Đái tháo đường type 2: chọn thuốc hạ đường huyết', desc: 'Metformin nền tảng; ưu tiên SGLT2i hoặc GLP-1 RA khi có bệnh tim mạch, suy tim hoặc bệnh thận mạn.', tags: ['Nội tiết', 'Phác đồ'], p: 'medium', d: 6, v: 2,
      content: sec('Nguyên tắc', 'Chọn thuốc dựa trên bệnh đồng mắc trước, sau đó mới đến mức HbA1c cần hạ.') + sec('Theo bệnh đồng mắc', ['Bệnh tim mạch do xơ vữa: GLP-1 RA hoặc SGLT2i có lợi ích đã chứng minh.', 'Suy tim: SGLT2i.', 'Bệnh thận mạn (eGFR ≥ 20): SGLT2i; thêm GLP-1 RA nếu cần.']) + sec('Mục tiêu HbA1c', 'Thường &lt; 7%. Nới lỏng 7,5–8% ở người cao tuổi, nhiều bệnh nền hoặc hay hạ đường huyết.') }),
    mk({ id: 'n4', title: 'Đọc ECG trong 10 bước', desc: 'Trình tự hệ thống: tần số, nhịp, trục, sóng P, PR, QRS, ST, T, QT và so sánh ECG cũ.', tags: ['Tim mạch', 'ECG'], p: 'medium', fav: 1, d: 9, imgs: ['Nhịp xoang bình thường', 'Block nhánh phải', 'STEMI thành dưới'],
      content: '<h2>Trình tự</h2><ol><li>Kiểm tra tên, thời gian, chuẩn điện thế (10 mm/mV, 25 mm/s).</li><li>Tần số: 300 / số ô lớn giữa hai R.</li><li>Nhịp: đều hay không, có P trước mỗi QRS?</li><li>Trục: DI và aVF.</li><li>Sóng P: hình dạng, thời gian.</li><li>Khoảng PR: 120–200 ms.</li><li>QRS: rộng &gt; 120 ms?</li><li>Đoạn ST: chênh lên / chênh xuống theo vùng.</li><li>Sóng T: đảo ngược, cao nhọn.</li><li>QTc và so sánh với ECG cũ.</li></ol>' }),
    mk({ id: 'n5', title: 'Kháng sinh kinh nghiệm cho viêm phổi cộng đồng', desc: 'Phân tầng theo CURB-65 và lựa chọn kháng sinh cho ngoại trú, nội trú và ICU.', tags: ['Hô hấp', 'Kháng sinh'], p: 'high', d: 12, v: 2,
      content: sec('Phân tầng CURB-65', ['0–1 điểm: cân nhắc điều trị ngoại trú.', '2 điểm: nhập viện.', '≥ 3 điểm: nặng, cân nhắc ICU.']) + sec('Lựa chọn', ['Ngoại trú: amoxicillin liều cao, hoặc macrolid nếu dị ứng.', 'Nội trú: beta-lactam + macrolid.', 'ICU: beta-lactam + macrolid hoặc fluoroquinolon hô hấp.']) + sec('Thời gian', 'Thường 5 ngày nếu lâm sàng ổn định ≥ 48 giờ.') }),
    mk({ id: 'n6', title: 'Liều hạ sốt ở trẻ em', desc: 'Paracetamol 10–15 mg/kg mỗi 4–6 giờ; ibuprofen 5–10 mg/kg mỗi 6–8 giờ.', tags: ['Nhi khoa', 'Dược'], p: 'medium', d: 15, cm: [['Hỏi kỹ phụ huynh đã cho uống gì ở nhà trước khi kê.', 14]],
      content: sec('Paracetamol', '10–15 mg/kg/lần, cách 4–6 giờ, tối đa 60 mg/kg/ngày.') + sec('Ibuprofen', '5–10 mg/kg/lần, cách 6–8 giờ; tránh khi mất nước, trẻ &lt; 3 tháng.') + sec('Lưu ý', ['Không khuyến cáo xen kẽ thường quy hai thuốc.', 'Mục tiêu là sự thoải mái của trẻ, không phải nhiệt độ bình thường.']) }),
    mk({ id: 'n7', title: 'Thang điểm Glasgow (GCS)', desc: 'Mắt – Lời nói – Vận động; tổng 3–15, ≤ 8 cân nhắc bảo vệ đường thở.', tags: ['Thần kinh', 'Cấp cứu'], p: 'low', d: 18,
      content: '<h2>Bảng điểm</h2><table><tr><th>Thành phần</th><th>Điểm</th><th>Đáp ứng tốt nhất</th></tr><tr><td>Mắt (E)</td><td>1–4</td><td>Mở mắt tự nhiên</td></tr><tr><td>Lời nói (V)</td><td>1–5</td><td>Định hướng tốt</td></tr><tr><td>Vận động (M)</td><td>1–6</td><td>Làm theo lệnh</td></tr></table><p>Ghi rõ từng thành phần, ví dụ <strong>E3V4M6</strong>, thay vì chỉ tổng điểm.</p>' }),
    mk({ id: 'n8', title: 'Tiếp cận đau ngực cấp tại cấp cứu', desc: 'Loại trừ 5 nguyên nhân nguy hiểm: hội chứng vành cấp, bóc tách động mạch chủ, thuyên tắc phổi, tràn khí màng phổi, vỡ thực quản.', tags: ['Tim mạch', 'Cấp cứu'], p: 'high', d: 21, v: 2,
      content: sec('Trong 10 phút đầu', ['ECG 12 chuyển đạo.', 'Sinh hiệu, SpO₂, HA hai tay.', 'Troponin độ nhạy cao.']) + sec('Gợi ý nguyên nhân', 'Đau xé lan sau lưng, chênh HA hai tay → nghĩ bóc tách. Khó thở, nhịp nhanh, yếu tố nguy cơ huyết khối → thuyên tắc phổi.') }),
    mk({ id: 'n9', title: 'Hạ natri máu: tiếp cận và điều chỉnh', desc: 'Đánh giá thể tích, áp lực thẩm thấu; tốc độ điều chỉnh không quá 8–10 mmol/L trong 24 giờ.', tags: ['Nội khoa', 'Điện giải'], p: 'medium', d: 26,
      content: sec('Tiếp cận', ['Đo áp lực thẩm thấu máu để loại trừ hạ natri giả.', 'Đánh giá thể tích: giảm, bình thường, tăng.', 'Natri và áp lực thẩm thấu niệu.']) + sec('Điều chỉnh', 'Có triệu chứng nặng: NaCl 3% 150 ml trong 20 phút, lặp lại tới khi Na tăng 5 mmol/L. Không vượt quá 10 mmol/L/24 giờ.') }),
    mk({ id: 'n10', title: 'Hen phế quản: các bậc điều trị GINA', desc: 'ICS-formoterol theo nhu cầu cho bậc 1–2; tăng bậc khi kiểm soát kém.', tags: ['Hô hấp'], p: 'medium', d: 33,
      content: sec('Nguyên tắc', 'Không dùng SABA đơn độc. Đánh giá kỹ thuật hít và tuân thủ trước khi tăng bậc.') + sec('Các bậc', ['Bậc 1–2: ICS-formoterol liều thấp khi cần.', 'Bậc 3: ICS-formoterol liều thấp duy trì và cắt cơn.', 'Bậc 4: liều trung bình.', 'Bậc 5: chuyển chuyên khoa, cân nhắc sinh học.']) }),
    mk({ id: 'n11', title: 'Đọc X-quang ngực có hệ thống', desc: 'Kỹ thuật – đường thở – xương – tim – cơ hoành – phổi – vùng khuất.', tags: ['Chẩn đoán hình ảnh'], p: 'low', d: 40, imgs: ['Phim PA chuẩn', 'Các vùng khuất cần xem lại'],
      content: sec('Trình tự ABCDE', ['A — Airway: khí quản, carina.', 'B — Breathing: phổi, màng phổi.', 'C — Cardiac: bóng tim, trung thất.', 'D — Diaphragm: vòm hoành, góc sườn hoành.', 'E — Everything else: xương, mô mềm, ống/dây.']) }),
    mk({ id: 'n12', title: 'Bệnh thận mạn: phân giai đoạn KDIGO', desc: 'Phân loại theo eGFR (G1–G5) và albumin niệu (A1–A3).', tags: ['Thận học'], p: 'low', d: 52,
      content: sec('eGFR', ['G1 ≥ 90', 'G2 60–89', 'G3a 45–59', 'G3b 30–44', 'G4 15–29', 'G5 &lt; 15']) + sec('Albumin niệu (ACR)', ['A1 &lt; 30 mg/g', 'A2 30–300 mg/g', 'A3 &gt; 300 mg/g']) }),
    mk({ id: 'n13', title: 'Suy tim EF giảm: 4 trụ cột điều trị', desc: 'ARNI/ACEi, chẹn beta, MRA và SGLT2i — khởi đầu sớm, tối ưu liều dần.', tags: ['Tim mạch', 'Phác đồ'], p: 'high', fav: 1, d: 60, v: 2,
      content: sec('Bốn trụ cột', ['ARNI (hoặc ACEi/ARB nếu không dùng được).', 'Chẹn beta: bisoprolol, carvedilol, metoprolol succinat.', 'MRA: spironolacton hoặc eplerenon.', 'SGLT2i: dapagliflozin hoặc empagliflozin.']) + sec('Thực hành', 'Khởi đầu cả bốn nhóm liều thấp trong vài tuần đầu, hơn là tối ưu tuần tự từng thuốc.') }),
    mk({ id: 'n14', title: 'Đọc công thức máu cơ bản', desc: 'Hb, MCV, bạch cầu và công thức, tiểu cầu — các mẫu bất thường thường gặp.', tags: ['Xét nghiệm'], p: 'low', d: 75,
      content: sec('Thiếu máu theo MCV', ['Nhỏ (&lt; 80 fL): thiếu sắt, thalassemia.', 'Bình thường: bệnh mạn tính, mất máu cấp, suy tuỷ.', 'To (&gt; 100 fL): thiếu B12/folat, rượu, thuốc.']) }),
    // ── END verbatim block ───────────────────────────────────────────────
  ];
}

/**
 * Câu hỏi của bản ghi quiz mẫu trên n1 — nguyên văn prototype.
 */
const SEED_QUIZ_QUESTIONS: Question[] = [
  {
    q: 'Mục tiêu huyết áp cho đa số bệnh nhân nếu dung nạp tốt là bao nhiêu?',
    options: ['< 130/80 mmHg', '< 140/90 mmHg', '< 150/90 mmHg', '< 120/70 mmHg'],
    answer: 0,
    explain: 'Đa số bệnh nhân hướng tới < 130/80 mmHg nếu dung nạp tốt.',
  },
  {
    q: 'Ngưỡng HA tại nhà để chẩn đoán tăng huyết áp?',
    options: ['≥ 140/90', '≥ 130/80', '≥ 135/85', '≥ 125/75'],
    answer: 2,
    explain: 'HA tại nhà trung bình ≥ 135/85 mmHg.',
  },
  {
    q: 'Thuốc thêm vào khi tăng huyết áp kháng trị?',
    options: ['Hydralazin', 'Spironolacton', 'Clonidin', 'Doxazosin'],
    answer: 1,
    explain: 'Spironolacton 25–50 mg là lựa chọn bậc 4.',
  },
  {
    q: 'Phối hợp nào KHÔNG được khuyến cáo?',
    options: ['ACEi + CCB', 'ARB + lợi tiểu', 'CCB + lợi tiểu', 'ACEi + ARB'],
    answer: 3,
    explain: 'Không phối hợp ACEi với ARB.',
  },
];

/**
 * part-0-contracts §8: prototype ghi `score: 3` nhưng `picks: [0,2,1,3]` lại
 * đúng cả 4 câu — trang chi tiết sẽ hiện "3/4 · 75%" trong khi phần xem lại
 * đánh dấu ✓ cả 4. Chốt: picks câu cuối đổi thành 0 (sai) và `score` LUÔN
 * được TÍNH từ picks, không bao giờ hard-code.
 */
export const SEED_QUIZ_PICKS: (number | null)[] = [0, 2, 1, 0];

/** Điểm = số câu `picks[i] === questions[i].answer`. Dùng cho mọi bản ghi quiz. */
export function scoreOf(questions: Question[], picks: (number | null)[]): number {
  return questions.reduce((acc, q, i) => acc + (picks[i] === q.answer ? 1 : 0), 0);
}

export function SEED(): Note[] {
  const L = SEED0();
  const n1 = L[0];
  n1.content = n1.content.replace(
    'Ưu tiên viên phối hợp liều cố định để cải thiện tuân thủ.',
    '<mark data-hl="hseed1">Ưu tiên viên phối hợp liều cố định để cải thiện tuân thủ.</mark>',
  );
  n1.versions[n1.versions.length - 1].content = n1.content;

  const questions = SEED_QUIZ_QUESTIONS.map((q) => ({ ...q, options: [...q.options] }));
  const picks = [...SEED_QUIZ_PICKS];
  const seededQuiz: Quiz = {
    id: 'qs1',
    date: iso(1.5),
    score: scoreOf(questions, picks),
    total: questions.length,
    source: 'offline',
    picks,
    questions,
  };
  n1.quizzes = [seededQuiz];

  return L;
}
