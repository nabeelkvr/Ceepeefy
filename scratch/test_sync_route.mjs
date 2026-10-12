async function testRoute() {
  console.log("Testing POST /api/spotify/sync ...");

  // Test 1: Missing ID
  const res1 = await fetch("http://localhost:3000/api/spotify/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data1 = await res1.json();
  console.log("Test 1 (Missing ID): status", res1.status, data1.error);
  if (res1.status !== 400) throw new Error("Expected 400 for missing ID");

  console.log("✅ Route verification passed!");
}

testRoute().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
