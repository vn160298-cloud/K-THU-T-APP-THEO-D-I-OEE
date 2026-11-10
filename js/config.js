// ====== CẤU HÌNH KẾT NỐI SUPABASE ======
// Lấy 2 giá trị này tại Supabase > Project Settings > API
// (anon key là khóa công khai, an toàn khi để trong mã nguồn — dữ liệu được bảo vệ bằng RLS)
export const SUPABASE_URL = 'https://vsuucatoiivozzmjmhyu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdXVjYXRvaWl2b3p6bWptaHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MTY1NTYsImV4cCI6MjEwOTQ5MjU1Nn0.XSfmX0-36jofL6H7IpFyE68eArstCLbFXQPf7LXiSIM';

export const APP_NAME = 'KỸ THUẬT - THEO DÕI OEE';
export const APP_VERSION = '1.0.0';
// Đuôi email nội bộ & mật khẩu ghép từ PIN — phải khớp với hàm SQL email_tu_ma / _dat_pin
export const EMAIL_DOMAIN = 'oee.nutrinest.local';
export const pinToPassword = (pin) => `NN-${pin}-OEE`;
