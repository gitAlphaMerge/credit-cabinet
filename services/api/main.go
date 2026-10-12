package main

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// Тело /score до 5 МБ по контракту, запас на JSON-обёртку.
const maxBody = 6 << 20

type ProxyHandler struct {
	mlURL      string
	httpClient *http.Client
}

func NewProxyHandler() *ProxyHandler {
	mlURL := os.Getenv("ML_URL")
	if mlURL == "" {
		mlURL = "http://ml-model:5000"
	}

	return &ProxyHandler{
		mlURL: mlURL,
		httpClient: &http.Client{
			// выписка на 50 000 строк считается дольше 10 с
			Timeout: 30 * time.Second,
		},
	}
}

func (h *ProxyHandler) HandleScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		w.Write([]byte(`{"error":"method not allowed"}`))
		return
	}

	targetURL := h.mlURL + "/score"
	body := http.MaxBytesReader(w, r.Body, maxBody)

	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"failed to construct upstream request"}`))
		return
	}

	// без длины Go шлёт тело чанками, а окошко такое режет 411 (security.py)
	proxyReq.ContentLength = r.ContentLength

	if ct := r.Header.Get("Content-Type"); ct != "" {
		proxyReq.Header.Set("Content-Type", ct)
	}

	resp, err := h.httpClient.Do(proxyReq)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")

		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			w.Write([]byte(`{"error":"too_large","detail":"body over 5 MB"}`))
			return
		}

		w.WriteHeader(http.StatusBadGateway)
		if errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
			w.Write([]byte(`{"error":"bad_gateway","detail":"ml-model upstream timed out"}`))
			return
		}

		w.Write([]byte(`{"error":"bad_gateway","detail":"ml-model upstream is unavailable or offline"}`))
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	http.HandleFunc("/score", NewProxyHandler().HandleScore)

	log.Printf("запущен на :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("server err %v", err)
	}
}
