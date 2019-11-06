LDLIBS += -lutil
CFLAGS += -std=c99 -Wall -Wextra

.PHONY: all clean run

all: pty

pty: pty.c

clean:
	rm pty

run: pty
	./pty
