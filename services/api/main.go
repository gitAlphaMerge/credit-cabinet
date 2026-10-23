package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const maxBody = 6 << 20

type ProxyHandler struct {
	mlURL      string
	httpClient *http.Client
	db         *sql.DB
}

func initDB() (*sql.DB, error) {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "credit_cabinet.db"
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	query := `
	CREATE TABLE IF NOT EXISTS dossiers (
		decision_id TEXT PRIMARY KEY,
		model_version TEXT,
		request_payload TEXT,
		response_payload TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`
	if _, err := db.Exec(query); err != nil {
		return nil, err
	}

	return db, nil
}

func NewProxyHandler(db *sql.DB) *ProxyHandler {
	mlURL := os.Getenv("ML_URL")
	if mlURL == "" {
		mlURL = "http://ml-model:5000"
	}

	return &ProxyHandler{
		mlURL: mlURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		db: db,
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
	limitedBody := http.MaxBytesReader(w, r.Body, maxBody)

	reqBytes, err := io.ReadAll(limitedBody)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			w.Write([]byte(`{"error":"too_large","detail":"body over 5 MB"}`))
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"failed to read request body"}`))
		return
	}

	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, bytes.NewReader(reqBytes))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"failed to construct upstream request"}`))
		return
	}

	proxyReq.ContentLength = int64(len(reqBytes))
	if ct := r.Header.Get("Content-Type"); ct != "" {
		proxyReq.Header.Set("Content-Type", ct)
	}

	resp, err := h.httpClient.Do(proxyReq)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		if errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
			w.Write([]byte(`{"error":"bad_gateway","detail":"ml-model upstream timed out"}`))
			return
		}
		w.Write([]byte(`{"error":"bad_gateway","detail":"ml-model upstream is unavailable or offline"}`))
		return
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"error":"failed to read upstream response"}`))
		return
	}

	if resp.StatusCode == http.StatusOK && h.db != nil {
		var scoreResp struct {
			DecisionID   string `json:"decision_id"`
			ModelVersion string `json:"model_version"`
		}
		_ = json.Unmarshal(respBytes, &scoreResp)

		if scoreResp.DecisionID != "" {
			_, err = h.db.Exec(
				`INSERT INTO dossiers (decision_id, model_version, request_payload, response_payload) VALUES (?, ?, ?, ?)`,
				scoreResp.DecisionID, scoreResp.ModelVersion, string(reqBytes), string(respBytes),
			)
			if err != nil {
				log.Printf("ошибка сохранения досье в sqlite: %v", err)
			}
		}
	}

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	w.Write(respBytes)
}

func (h *ProxyHandler) HandleGetDossier(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/dossier/")
	if id == "" || id == "/dossier" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"id is required"}`))
		return
	}

	var decisionID, modelVersion, reqPayload, respPayload, createdAt string
	row := h.db.QueryRow(`SELECT decision_id, model_version, request_payload, response_payload, created_at FROM dossiers WHERE decision_id = ?`, id)
	err := row.Scan(&decisionID, &modelVersion, &reqPayload, &respPayload, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":"dossier not found"}`))
		return
	} else if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"database query failed"}`))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"decision_id":      decisionID,
		"model_version":    modelVersion,
		"request_payload":  json.RawMessage(reqPayload),
		"response_payload": json.RawMessage(respPayload),
		"created_at":       createdAt,
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	db, err := initDB()
	if err != nil {
		log.Printf("Внимание: SQLite не инициализирован: %v", err)
	} else {
		defer db.Close()
		log.Println("SQLite подключен успешно")
	}

	proxyHandler := NewProxyHandler(db)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	http.HandleFunc("/score", proxyHandler.HandleScore)
	http.HandleFunc("/dossier/", proxyHandler.HandleGetDossier)

	log.Printf("запущен на :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("server err %v", err)
	}
}
