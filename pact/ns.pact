(define-keyset 'free-ns-user)
(define-keyset 'free-ns-admin)
(ns.write-registry (read-msg 'ns) (keyset-ref-guard 'free-ns-admin) true)
(define-namespace
  (read-msg 'ns)
  (keyset-ref-guard 'free-ns-user)
  (keyset-ref-guard 'free-ns-admin)
)