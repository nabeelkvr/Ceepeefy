"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import SelfMixPage from "../self-mix/page";

export default function ArtistsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/self-mix");
  }, [router]);

  return <SelfMixPage />;
}
