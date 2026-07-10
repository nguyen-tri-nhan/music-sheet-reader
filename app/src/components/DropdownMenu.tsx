import { useEffect, useRef, useState } from "react";

interface DropdownMenuProps {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/** Nút mở 1 panel nhỏ chứa các toggle/lựa chọn phụ - dùng để gom nhóm các tùy chọn hiển thị/cài
 * đặt lại thành 1 mục trên toolbar thay vì để rời rạc, tránh toolbar dài dần theo từng tính năng
 * mới. Tự viết bằng React + CSS thuần (không dùng MUI hay thư viện UI nào) để không thêm
 * dependency và khớp đúng giao diện tối màu đã có sẵn - xem `specs/keyboard.md`. */
export function DropdownMenu({ label, disabled, children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Đóng panel nếu bị disabled giữa chừng (vd hết file, chuyển sang màn hình upload).
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="dropdown-menu" ref={containerRef}>
      <button
        type="button"
        className="dropdown-menu__trigger"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {label} <span className="dropdown-menu__caret">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="dropdown-menu__panel">{children}</div>}
    </div>
  );
}
