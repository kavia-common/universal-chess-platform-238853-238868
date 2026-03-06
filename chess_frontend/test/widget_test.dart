import 'package:chess_frontend/src/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Home screen shows title and primary actions', (tester) async {
    await tester.pumpWidget(const ChessApp());

    expect(find.text('Universal Chess'), findsOneWidget);
    expect(find.text('Local Two-Player'), findsOneWidget);
    expect(find.byIcon(Icons.settings), findsOneWidget);
  });

  testWidgets('Tapping Local Two-Player opens game screen', (tester) async {
    await tester.pumpWidget(const ChessApp());

    await tester.tap(find.text('Local Two-Player'));
    await tester.pumpAndSettle();

    expect(find.text('Local Game'), findsOneWidget);
    expect(find.text('Moves'), findsOneWidget);
  });
}
