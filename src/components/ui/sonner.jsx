"use client";
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

const Toaster = ({
  ...props
}) => {
  const { theme = "system" } = useTheme()

  return (
    (<Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          // pointer-events-auto: an open dialog sets pointer-events:none on
          // <body>; toasts (Retry) must stay tappable above it.
          toast:
            "pointer-events-auto group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          // 44pt minimum tap targets (Apple HIG) for Retry / dismiss.
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground !min-h-[44px] !px-4 !text-sm",
          closeButton: "!w-8 !h-8 [&>svg]:!w-4 [&>svg]:!h-4 after:absolute after:-inset-1.5 after:content-['']",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />)
  );
}

export { Toaster }
