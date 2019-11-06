#!/bin/bash

echo "OUT:one"
echo "ERR:one" >&2
echo "OUT:two"
echo "OUT:three"
echo "ERR:two" >&2
echo "ERR:three" >&2
echo "OUT:four"
echo "OUT:five"
echo "OUT:six"
echo "ERR:four" >&2
echo "OUT:seven"
echo "ERR:five" >&2
