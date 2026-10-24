# Import: read a table pasted from Excel or a CSV file into daily returns
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import io
import numpy as np
import pandas as pd

text = """date;close
2024-01-02;100,0
2024-01-03;101,5
2024-01-04;100,8
2024-01-05;102,2"""                                  # paste from Excel here (tab or ; separated, decimal comma allowed)
sep = "	" if "	" in text else (";" if ";" in text else ",")
df = pd.read_csv(io.StringIO(text), sep=sep, decimal="," if sep != "," else ".", parse_dates=[0], index_col=0)
px = df.iloc[:, 0].dropna().sort_index()
r = px.pct_change().dropna()
print(r.describe())
