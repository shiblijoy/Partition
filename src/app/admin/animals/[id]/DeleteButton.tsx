"use client";

export function DeleteButton({
  action,
  confirmText,
  children,
  className,
}: {
  action: () => Promise<void>;
  confirmText: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
