<?php
// Minimal example for saving a sale. Adapt to your DB schema.
// Expects JSON POST: { cart, totals, reserved, payment, meta }
// Returns JSON: { success: true, saleId: 123 } or { success:false, message: '...' }

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data) {
  echo json_encode(['success' => false, 'message' => 'Invalid JSON']); exit;
}

// TODO: Replace with your DB connection and insert logic
// For example (mysqli):
// require_once __DIR__ . '/../php/db_connect.php';
// $stmt = $conn->prepare('INSERT INTO sales (payload, created_at) VALUES (?, NOW())');
// $json = json_encode($data, JSON_UNESCAPED_UNICODE);
// $stmt->bind_param('s', $json);
// $stmt->execute();
// $saleId = $stmt->insert_id;

$saleId = time(); // placeholder unique ID using timestamp for demo

echo json_encode(['success' => true, 'saleId' => $saleId]);
exit;
?>