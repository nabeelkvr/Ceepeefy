"use client";

import React, { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function SelfMixIdRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    if (params?.id) {
      router.replace(`/self-mix?id=${encodeURIComponent(params.id)}`);
    } else {
      router.replace("/self-mix");
    }
  }, [params, router]);

  return (
    <div className="w-full h-96 flex items-center justify-center text-outline text-xs font-mono">
      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2.5" />
      Opening Self Mix...
    </div>
  );
}
