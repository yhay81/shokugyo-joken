# Security

脆弱性は公開Issueに詳細を書かず、GitHubのPrivate vulnerability reportingから報告してください。

## Current controls

- 静的公式データと同一オリジンAPIのみ
- CSP、frame拒否、MIME sniffing拒否、権限ポリシー
- テレメトリは同一オリジン、イベントallowlist、512 byte上限
- 匿名セッションIDは保存前にSHA-256化
- 外部スクリプト、外部フォント、認証、アップロード機能なし
- 35日を超えたイベントを定期削除
